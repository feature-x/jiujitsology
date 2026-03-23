import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { transcribeVideo } from "@/lib/transcription";

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

  // Return immediately — transcription runs async
  const response = NextResponse.json(
    { videoId, status: "transcribing" },
    { status: 202 }
  );

  // Run transcription in the background
  // (Next.js API routes can continue processing after sending response
  //  via waitUntil in edge runtime, but in Node runtime we just
  //  fire-and-forget with error handling)
  runTranscription(supabase, video.id, video.storage_path).catch((err) => {
    console.error(`Transcription failed for video ${videoId}:`, err);
  });

  return response;
}

async function runTranscription(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  videoId: string,
  storagePath: string
) {
  try {
    // Generate a signed URL for AssemblyAI to download the video
    const { data: signedUrlData, error: signError } = await supabase.storage
      .from("videos")
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

    if (signError || !signedUrlData?.signedUrl) {
      throw new Error(
        `Failed to create signed URL: ${signError?.message || "unknown error"}`
      );
    }

    // Transcribe via AssemblyAI
    const result = await transcribeVideo(signedUrlData.signedUrl);

    // Store transcription
    const { error: insertError } = await supabase
      .from("transcriptions")
      .insert({
        video_id: videoId,
        text: result.text,
        segments: result.segments,
      });

    if (insertError) {
      throw new Error(`Failed to store transcription: ${insertError.message}`);
    }

    // Update video with duration and advance status
    await supabase
      .from("videos")
      .update({
        status: "embedding", // Next pipeline step
        duration_sec: Math.round(result.durationSec),
      })
      .eq("id", videoId);

    console.log(
      `Transcription complete for video ${videoId}: ${result.durationSec.toFixed(0)}s, ` +
        `${result.segments.length} segments, ~$${(result.durationSec / 60 * 0.006).toFixed(3)} cost`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown transcription error";

    console.error(`Transcription error for video ${videoId}:`, message);

    await supabase
      .from("videos")
      .update({ status: "error", error_message: message })
      .eq("id", videoId);
  }
}
