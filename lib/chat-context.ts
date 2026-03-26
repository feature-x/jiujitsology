import { embedQuery } from "@/lib/embeddings";
import type { createServerClient } from "@/lib/supabase/server";

interface ChunkResult {
  content: string;
  start_time: number;
  end_time: number;
  similarity: number;
  video_id: string;
}

interface GraphContext {
  relevantChunks: string[];
  graphSummary: string;
  ontologySummary: string;
}

/**
 * Build context for the LLM from the user's knowledge graph and embeddings.
 * Uses hybrid RAG (vector search) + knowledge graph (structured data).
 */
export async function buildChatContext(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  userMessage: string
): Promise<GraphContext> {
  // 1. Semantic search — find relevant transcription chunks
  const queryEmbedding = await embedQuery(userMessage);

  const { data: chunks } = await supabase.rpc("match_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 5,
    filter_user_id: userId,
  });

  const relevantChunks = (chunks as ChunkResult[] || []).map(
    (c) => c.content
  );

  // 2. Load knowledge graph summary
  const { data: nodes } = await supabase
    .from("nodes")
    .select("type, label")
    .eq("user_id", userId)
    .limit(100);

  const { data: edges } = await supabase
    .from("edges")
    .select("source_id, target_id, relationship")
    .eq("user_id", userId)
    .limit(200);

  // Build a readable graph summary
  const nodeMap = new Map<string, string>();
  const nodesByType = new Map<string, string[]>();

  for (const node of nodes || []) {
    nodeMap.set(node.label.toLowerCase(), node.type);
    const list = nodesByType.get(node.type) || [];
    list.push(node.label);
    nodesByType.set(node.type, list);
  }

  // Get node labels for edge descriptions
  const { data: allNodes } = await supabase
    .from("nodes")
    .select("id, label")
    .eq("user_id", userId);

  const idToLabel = new Map<string, string>();
  for (const n of allNodes || []) {
    idToLabel.set(n.id, n.label);
  }

  const edgeDescriptions = (edges || [])
    .map((e) => {
      const source = idToLabel.get(e.source_id) || "?";
      const target = idToLabel.get(e.target_id) || "?";
      return `${source} --[${e.relationship}]--> ${target}`;
    })
    .slice(0, 50);

  let graphSummary = "";
  for (const [type, labels] of nodesByType) {
    graphSummary += `${type}: ${labels.join(", ")}\n`;
  }
  if (edgeDescriptions.length > 0) {
    graphSummary += `\nRelationships:\n${edgeDescriptions.join("\n")}`;
  }

  // 3. Load ontology for schema context
  const { data: ontology } = await supabase
    .from("ontology_entries")
    .select("category, name, description");

  const ontologySummary = (ontology || [])
    .map((e) => `${e.category}: ${e.name} — ${e.description || ""}`)
    .join("\n");

  return { relevantChunks, graphSummary, ontologySummary };
}

export function buildSystemPrompt(context: GraphContext): string {
  let prompt = `You are JiuJitsology, an AI assistant specialized in Brazilian Jiu-Jitsu. You help users understand and explore their BJJ instructional video library.

You have access to:
1. A knowledge graph of BJJ techniques, positions, and their relationships extracted from the user's instructional videos.
2. Relevant transcription passages from those videos.

Answer questions by combining your knowledge of BJJ with the specific content from the user's library. Cite specific techniques and relationships from the knowledge graph when relevant. If a question is about content not in the user's library, say so.

Be concise and direct. Use BJJ terminology naturally.`;

  if (context.ontologySummary) {
    prompt += `\n\n## Ontology (valid types in the knowledge graph)\n${context.ontologySummary}`;
  }

  if (context.graphSummary) {
    prompt += `\n\n## Knowledge Graph\n${context.graphSummary}`;
  }

  if (context.relevantChunks.length > 0) {
    prompt += `\n\n## Relevant Transcription Passages\n${context.relevantChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`;
  }

  return prompt;
}
