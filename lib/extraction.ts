import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { buildExtractionPrompt } from "@/lib/extraction-prompt";
import type { OntologyEntry } from "@/lib/ontology";

const MAX_TEXT_LENGTH = 100_000; // characters per LLM call

const extractionSchema = z.object({
  nodes: z.array(
    z.object({
      type: z.string().describe("Node type from the ontology"),
      label: z.string().describe("Canonical name for this entity"),
      properties: z.string().optional().describe("Optional properties as JSON string, e.g. {\"gi_nogi\": \"both\"}"),
    })
  ),
  edges: z.array(
    z.object({
      source_label: z.string().describe("Label of the source node"),
      target_label: z.string().describe("Label of the target node"),
      relationship: z.string().describe("Edge type from the ontology"),
      properties: z.string().optional().describe("Optional properties as JSON string, e.g. {\"gi_nogi\": \"both\"}"),
    })
  ),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

/**
 * Extract knowledge graph nodes and edges from transcription text
 * using the ontology as a constraint schema.
 */
export async function extractKnowledge(
  transcriptionText: string,
  ontologyEntries: OntologyEntry[]
): Promise<ExtractionResult> {
  const validNodeTypes = new Set(
    ontologyEntries.filter((e) => e.category === "node_type").map((e) => e.name)
  );
  const validEdgeTypes = new Set(
    ontologyEntries.filter((e) => e.category === "edge_type").map((e) => e.name)
  );

  // Chunk text if too long
  const textChunks = chunkText(transcriptionText, MAX_TEXT_LENGTH);
  const allNodes: ExtractionResult["nodes"] = [];
  const allEdges: ExtractionResult["edges"] = [];

  for (const chunk of textChunks) {
    const prompt = buildExtractionPrompt(ontologyEntries, chunk);

    const { object } = await generateObject({
      model: openai("gpt-4o"),
      schema: extractionSchema,
      prompt,
    });

    allNodes.push(...object.nodes);
    allEdges.push(...object.edges);
  }

  // Filter to only valid ontology types
  const validNodes = allNodes.filter((n) => {
    if (!validNodeTypes.has(n.type)) {
      console.warn(`Skipping node with invalid type: ${n.type} (${n.label})`);
      return false;
    }
    return true;
  });

  const validEdges = allEdges.filter((e) => {
    if (!validEdgeTypes.has(e.relationship)) {
      console.warn(
        `Skipping edge with invalid type: ${e.relationship} (${e.source_label} → ${e.target_label})`
      );
      return false;
    }
    return true;
  });

  // Deduplicate nodes by (type, label)
  const nodeMap = new Map<string, ExtractionResult["nodes"][0]>();
  for (const node of validNodes) {
    const key = `${node.type}:${node.label.toLowerCase()}`;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, node);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: validEdges,
  };
}

/**
 * Store extracted nodes and edges in Supabase.
 * Deduplicates against existing nodes for the user.
 */
export async function storeExtraction(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createServerClient>>,
  userId: string,
  videoId: string,
  extraction: ExtractionResult
) {
  // Delete previous extraction for this video (idempotent re-run)
  await supabase.from("edges").delete().eq("source_video_id", videoId);
  await supabase.from("nodes").delete().eq("source_video_id", videoId);

  // Build a map of label → node ID (including existing nodes for this user)
  const nodeIdMap = new Map<string, string>();

  // Fetch existing nodes for deduplication
  const { data: existingNodes } = await supabase
    .from("nodes")
    .select("id, type, label")
    .eq("user_id", userId);

  if (existingNodes) {
    for (const node of existingNodes) {
      nodeIdMap.set(`${node.type}:${node.label.toLowerCase()}`, node.id);
    }
  }

  // Insert new nodes (skip if already exists for this user)
  for (const node of extraction.nodes) {
    const key = `${node.type}:${node.label.toLowerCase()}`;
    if (!nodeIdMap.has(key)) {
      const { data, error } = await supabase
        .from("nodes")
        .insert({
          user_id: userId,
          type: node.type,
          label: node.label,
          properties: parseProps(node.properties),
          source_video_id: videoId,
        })
        .select("id")
        .single();

      if (error) {
        console.warn(`Failed to insert node ${node.label}: ${error.message}`);
        continue;
      }

      nodeIdMap.set(key, data.id);
    }
  }

  // Insert edges (resolve labels to IDs)
  let edgesInserted = 0;
  for (const edge of extraction.edges) {
    // Try to find source and target by label (case-insensitive)
    const sourceId = findNodeId(nodeIdMap, edge.source_label);
    const targetId = findNodeId(nodeIdMap, edge.target_label);

    if (!sourceId || !targetId) {
      console.warn(
        `Skipping edge: could not resolve ${edge.source_label} → ${edge.target_label}`
      );
      continue;
    }

    const { error } = await supabase.from("edges").insert({
      user_id: userId,
      source_id: sourceId,
      target_id: targetId,
      relationship: edge.relationship,
      properties: parseProps(edge.properties),
      source_video_id: videoId,
    });

    if (error) {
      console.warn(
        `Failed to insert edge ${edge.source_label} → ${edge.target_label}: ${error.message}`
      );
      continue;
    }

    edgesInserted++;
  }

  return {
    nodesCreated: extraction.nodes.length,
    edgesCreated: edgesInserted,
    totalNodes: nodeIdMap.size,
  };
}

/** Parse properties from JSON string (LLM output) to object */
function parseProps(props: string | undefined): Record<string, unknown> {
  if (!props) return {};
  try {
    return JSON.parse(props);
  } catch {
    return {};
  }
}

/** Find a node ID by label, trying exact match then case-insensitive */
function findNodeId(
  nodeIdMap: Map<string, string>,
  label: string
): string | undefined {
  // Search all entries for a case-insensitive label match
  const lowerLabel = label.toLowerCase();
  for (const [key, id] of nodeIdMap) {
    const keyLabel = key.split(":").slice(1).join(":"); // Everything after first colon
    if (keyLabel === lowerLabel) {
      return id;
    }
  }
  return undefined;
}

/** Split text into chunks of max length at sentence boundaries */
function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Find the last sentence boundary before maxLength
    let splitAt = remaining.lastIndexOf(". ", maxLength);
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = maxLength; // Fall back to hard cut
    } else {
      splitAt += 2; // Include the period and space
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
