import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { citationCache } from "@/lib/citation-cache";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const citations = citationCache.get(user.id) || [];
  return NextResponse.json({ citations });
}
