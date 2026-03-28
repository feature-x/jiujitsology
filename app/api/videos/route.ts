import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkQuota } from "@/lib/quota";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, title, filename, status, duration_sec, error_message, created_at, instructor, instructional")
    .eq("user_id", user.id)
    .order("instructor", { ascending: true, nullsFirst: false })
    .order("instructional", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(videos);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, filename, storage_path, content_hash, instructor, instructional } = body;

  if (!title || !filename || !storage_path) {
    return NextResponse.json(
      { error: "Missing required fields: title, filename, storage_path" },
      { status: 400 }
    );
  }

  if (!instructor?.trim() || !instructional?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: instructor, instructional" },
      { status: 400 }
    );
  }

  // Check ingestion quota before creating video record
  const quota = await checkQuota(supabase, user.id, "ingest");
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Upload limit reached. Upgrade your plan for more capacity.",
        used: quota.used,
        limit: quota.limit,
        tier: quota.tier,
      },
      { status: 429 }
    );
  }

  // Verify the storage path is scoped to this user
  if (!storage_path.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: "Invalid storage path" },
      { status: 403 }
    );
  }

  const { data: video, error: insertError } = await supabase
    .from("videos")
    .insert({
      user_id: user.id,
      title,
      filename,
      storage_path,
      content_hash: content_hash || null,
      instructor: instructor || null,
      instructional: instructional || null,
      status: "uploaded",
    })
    .select("id, title, filename, status, created_at")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `Failed to create record: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(video, { status: 201 });
}
