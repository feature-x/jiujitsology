import { embedQuery } from "@/lib/embeddings";
import type { createServerClient } from "@/lib/supabase/server";

interface ChunkResult {
  content: string;
  start_time: number;
  end_time: number;
  similarity: number;
  video_id: string;
}

interface CitedChunk {
  citation: string;
  content: string;
}

interface GraphContext {
  relevantChunks: CitedChunk[];
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

  const chunkResults = (chunks as ChunkResult[]) || [];

  // Fetch video titles for the chunks
  const videoIds = [...new Set(chunkResults.map((c) => c.video_id))];
  const videoTitleMap = new Map<string, string>();

  if (videoIds.length > 0) {
    const { data: videos } = await supabase
      .from("videos")
      .select("id, title")
      .in("id", videoIds);

    for (const v of videos || []) {
      videoTitleMap.set(v.id, v.title);
    }
  }

  const relevantChunks: CitedChunk[] = chunkResults.map((c) => {
    const videoTitle = videoTitleMap.get(c.video_id) || "Unknown Video";
    const timeRange =
      c.start_time != null && c.end_time != null
        ? `${formatTimestamp(c.start_time)}-${formatTimestamp(c.end_time)}`
        : "";
    const citation = timeRange
      ? `${videoTitle} (${timeRange})`
      : videoTitle;

    return { citation, content: c.content };
  });

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

Answer questions by combining your knowledge of BJJ with the specific content from the user's library. When your answer is based on a specific transcription passage, cite the source by its number (e.g., "according to [1]") so the user knows which video and timestamp the information comes from. If a question is about content not in the user's library, say so.

Be concise and direct. Use BJJ terminology naturally.`;

  if (context.ontologySummary) {
    prompt += `\n\n## Ontology (valid types in the knowledge graph)\n${context.ontologySummary}`;
  }

  if (context.graphSummary) {
    prompt += `\n\n## Knowledge Graph\n${context.graphSummary}`;
  }

  if (context.relevantChunks.length > 0) {
    prompt += `\n\n## Relevant Transcription Passages\n${context.relevantChunks.map((c, i) => `[${i + 1}] ${c.citation}: "${c.content}"`).join("\n\n")}`;
  }

  return prompt;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
