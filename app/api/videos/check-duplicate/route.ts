import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content_hash } = await request.json();

  if (!content_hash) {
    return NextResponse.json(
      { error: "Missing required field: content_hash" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("videos")
    .select("id, title")
    .eq("user_id", user.id)
    .eq("content_hash", content_hash)
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json({
      duplicate: true,
      existing_title: existing.title,
    });
  }

  return NextResponse.json({ duplicate: false });
}
