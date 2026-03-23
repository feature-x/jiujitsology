import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { transcribeVideo } from "@/lib/transcription";
import { chunkSegments, embedChunks } from "@/lib/embeddings";

const SIGNED_URL_EXPIRY = 3600; // 1 hour — enough for AssemblyAI to download

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await params;

  // Fetch video (RLS ensures ownership)
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, storage_path, status")
    .eq("id", videoId)
    .single();

  if (fetchError || !video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only allow ingestion from "uploaded" or "error" status (retry)
  if (video.status !== "uploaded" && video.status !== "error") {
    return NextResponse.json(
      { error: `Cannot ingest: video is in '${video.status}' state` },
      { status: 409 }
    );
  }

  // Update status to transcribing
  await supabase
    .from("videos")
    .update({ status: "transcribing", error_message: null })
    .eq("id", videoId);

  // Return immediately — pipeline runs async
  const response = NextResponse.json(
    { videoId, status: "transcribing" },
    { status: 202 }
  );

  // Run full pipeline in the background
  runPipeline(supabase, user.id, video.id, video.storage_path).catch((err) => {
    console.error(`Pipeline failed for video ${videoId}:`, err);
  });

  return response;
}

async function runPipeline(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  videoId: string,
  storagePath: string
) {
  try {
    // ── Step 1: Transcribe ──────────────────────────────────────────
    const { data: signedUrlData, error: signError } = await supabase.storage
      .from("videos")
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (signError || !signedUrlData?.signedUrl) {
      throw new Error(
        `Failed to create signed URL: ${signError?.message || "unknown error"}`
      );
    }

    const result = await transcribeVideo(signedUrlData.signedUrl);

    const { data: transcription, error: insertError } = await supabase
      .from("transcriptions")
      .insert({
        video_id: videoId,
        text: result.text,
        segments: result.segments,
      })
      .select("id")
      .single();

    if (insertError || !transcription) {
      throw new Error(
        `Failed to store transcription: ${insertError?.message || "unknown"}`
      );
    }

    await supabase
      .from("videos")
      .update({
        status: "embedding",
        duration_sec: Math.round(result.durationSec),
      })
      .eq("id", videoId);

    console.log(
      `Transcription complete for video ${videoId}: ${result.durationSec.toFixed(0)}s, ` +
        `${result.segments.length} segments, ~$${((result.durationSec / 60) * 0.006).toFixed(3)} cost`
    );

    // ── Step 2: Chunk & Embed ───────────────────────────────────────
    const chunks = chunkSegments(result.segments);
    console.log(
      `Chunked ${result.segments.length} segments into ${chunks.length} chunks for video ${videoId}`
    );

    const embeddedChunks = await embedChunks(chunks);
    console.log(
      `Embedded ${embeddedChunks.length} chunks for video ${videoId}, ` +
        `~$${((result.text.length / 4 / 1_000_000) * 0.02).toFixed(4)} embedding cost`
    );

    // Insert chunks in batches
    const chunkRows = embeddedChunks.map((c) => ({
      user_id: userId,
      video_id: videoId,
      transcription_id: transcription.id,
      content: c.content,
      start_time: c.startTime,
      end_time: c.endTime,
      embedding: JSON.stringify(c.embedding),
    }));

    const BATCH_SIZE = 50;
    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      const batch = chunkRows.slice(i, i + BATCH_SIZE);
      const { error: chunkError } = await supabase
        .from("chunks")
        .insert(batch);

      if (chunkError) {
        throw new Error(
          `Failed to store chunks (batch ${i / BATCH_SIZE + 1}): ${chunkError.message}`
        );
      }
    }

    // Advance to next pipeline step
    await supabase
      .from("videos")
      .update({ status: "extracting" })
      .eq("id", videoId);

    console.log(
      `Embedding complete for video ${videoId}: ${embeddedChunks.length} chunks stored`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";

    console.error(`Pipeline error for video ${videoId}:`, message);

    await supabase
      .from("videos")
      .update({ status: "error", error_message: message })
      .eq("id", videoId);
  }
}
