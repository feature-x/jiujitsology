import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
}
const MAX_BATCH_SIZE = 100;
const TARGET_CHUNK_TOKENS = 500; // ~500 tokens per chunk

export interface Chunk {
  content: string;
  startTime: number;
  endTime: number;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

/**
 * Group transcription segments into chunks of roughly TARGET_CHUNK_TOKENS tokens.
 * Respects sentence boundaries from the transcription segments.
 */
export function chunkSegments(
  segments: { start: number; end: number; text: string }[]
): Chunk[] {
  if (segments.length === 0) return [];

  const chunks: Chunk[] = [];
  let currentTexts: string[] = [];
  let currentStart = segments[0].start;
  let currentEnd = segments[0].end;
  let currentTokenEstimate = 0;

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment.text);

    // If adding this segment would exceed target, finalize current chunk
    if (currentTokenEstimate > 0 && currentTokenEstimate + segmentTokens > TARGET_CHUNK_TOKENS) {
      chunks.push({
        content: currentTexts.join(" "),
        startTime: currentStart,
        endTime: currentEnd,
      });
      currentTexts = [];
      currentStart = segment.start;
      currentTokenEstimate = 0;
    }

    currentTexts.push(segment.text);
    currentEnd = segment.end;
    currentTokenEstimate += segmentTokens;
  }

  // Push remaining text as final chunk
  if (currentTexts.length > 0) {
    chunks.push({
      content: currentTexts.join(" "),
      startTime: currentStart,
      endTime: currentEnd,
    });
  }

  return chunks;
}

/**
 * Generate embeddings for chunks in batches.
 */
export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  const results: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    const response = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: response.data[j].embedding,
      });
    }
  }

  return results;
}

/**
 * Embed a single query string for similarity search.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  return response.data[0].embedding;
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
