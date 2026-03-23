import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
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

  // RLS ensures only owner's video is returned
  const { data: video, error } = await supabase
    .from("videos")
    .select("id, status, error_message")
    .eq("id", videoId)
    .single();

  if (error || !video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    videoId: video.id,
    status: video.status,
    error_message: video.error_message,
  });
}
