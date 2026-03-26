import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const SIGNED_URL_EXPIRY = 3600; // 1 hour

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

  return NextResponse.json({
    url: signedUrlData.signedUrl,
    expiresIn: SIGNED_URL_EXPIRY,
  });
}
