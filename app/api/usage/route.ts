import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { checkQuota, TIER_LIMITS } from "@/lib/quota";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // checkQuota auto-provisions records — use it to get current state
  const chatQuota = await checkQuota(supabase, user.id, "chat");
  const ingestQuota = await checkQuota(supabase, user.id, "ingest");

  const limits = TIER_LIMITS[chatQuota.tier] || TIER_LIMITS.free;

  // Fetch actual usage values
  const { data: usage } = await supabase
    .from("usage")
    .select("ingested_minutes_total, chat_queries_this_period")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    tier: chatQuota.tier,
    usage: {
      ingested_minutes_total: usage?.ingested_minutes_total || 0,
      chat_queries_this_period: usage?.chat_queries_this_period || 0,
    },
    limits: {
      ingest_minutes: limits.ingestMinutes,
      chat_queries: limits.chatUnlimited ? null : limits.chatQueries,
      chat_unlimited: limits.chatUnlimited,
    },
    quotas: {
      chat_allowed: chatQuota.allowed,
      ingest_allowed: ingestQuota.allowed,
    },
  });
}
