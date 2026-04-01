import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
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

  // Fetch the node to get its label (RLS ensures ownership)
  const { data: node, error: nodeError } = await supabase
    .from("nodes")
    .select("id, label")
    .eq("id", id)
    .single();

  if (nodeError || !node) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  // Search chunks across all videos for mentions of the node's label
  const { data: chunks, error: chunksError } = await supabase
    .from("chunks")
    .select("id, video_id, start_time, end_time, videos(title, instructor, instructional)")
    .eq("user_id", user.id)
    .ilike("content", `%${node.label}%`)
    .gt("start_time", 0)
    .order("start_time", { ascending: true })
    .limit(20);

  if (chunksError) {
    return NextResponse.json({ error: chunksError.message }, { status: 500 });
  }

  const segments = (chunks || []).map((chunk) => {
    const video = Array.isArray(chunk.videos)
      ? chunk.videos[0]
      : (chunk.videos as { title: string; instructor: string | null; instructional: string | null } | null);

    return {
      id: chunk.id,
      video_id: chunk.video_id,
      start_time: chunk.start_time,
      end_time: chunk.end_time,
      video_title: video?.title || null,
      instructor: video?.instructor || null,
      instructional: video?.instructional || null,
    };
  });

  return NextResponse.json({ segments });
}
