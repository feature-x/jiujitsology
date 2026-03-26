import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const SIGNED_URL_EXPIRY = 3600; // 1 hour

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const label = searchParams.get("label");

  // Fetch video (RLS ensures ownership)
  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, storage_path")
    .eq("id", id)
    .single();

  if (fetchError || !video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signedUrlData, error: signError } = await supabase.storage
    .from("videos")
    .createSignedUrl(video.storage_path, SIGNED_URL_EXPIRY);

  if (signError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { error: `Failed to create signed URL: ${signError?.message || "unknown"}` },
      { status: 500 }
    );
  }

  // If a label is provided, find the first chunk from this video that
  // mentions it and return its start_time for seek-to-timestamp.
  let startTime: number | null = null;
  if (label) {
    const { data: chunk } = await supabase
      .from("chunks")
      .select("start_time")
      .eq("video_id", id)
      .ilike("content", `%${label}%`)
      .order("start_time", { ascending: true })
      .limit(1)
      .single();

    if (chunk?.start_time != null) {
      startTime = chunk.start_time;
    }
  }

  return NextResponse.json({
    url: signedUrlData.signedUrl,
    expiresIn: SIGNED_URL_EXPIRY,
    startTime,
  });
}
