import type { createServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

export const TIER_LIMITS: Record<
  string,
  { ingestMinutes: number; chatQueries: number; chatUnlimited: boolean }
> = {
  free: { ingestMinutes: 60, chatQueries: 50, chatUnlimited: false },
  starter: { ingestMinutes: 600, chatQueries: 200, chatUnlimited: false },
  pro: { ingestMinutes: 3000, chatQueries: 0, chatUnlimited: true },
  library: { ingestMinutes: 12000, chatQueries: 0, chatUnlimited: true },
};

interface QuotaResult {
  allowed: boolean;
  reason?: "chat_limit" | "ingest_limit";
  used?: number;
  limit?: number;
  tier: string;
}

/**
 * Ensure subscription and usage rows exist for a user.
 * Auto-provisions with free-tier defaults on first call.
 */
async function ensureUserRecords(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tier: string; ingestedMinutes: number; chatQueries: number }> {
  // Fetch or create subscription
  let { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .single();

  if (!sub) {
    const { data: newSub } = await supabase
      .from("subscriptions")
      .insert({ user_id: userId, tier: "free" })
      .select("tier")
      .single();
    sub = newSub;
  }

  // Fetch or create usage
  let { data: usage } = await supabase
    .from("usage")
    .select("ingested_minutes_total, chat_queries_this_period")
    .eq("user_id", userId)
    .single();

  if (!usage) {
    const { data: newUsage } = await supabase
      .from("usage")
      .insert({ user_id: userId })
      .select("ingested_minutes_total, chat_queries_this_period")
      .single();
    usage = newUsage;
  }

  return {
    tier: sub?.tier || "free",
    ingestedMinutes: usage?.ingested_minutes_total || 0,
    chatQueries: usage?.chat_queries_this_period || 0,
  };
}

/**
 * Check if a user is allowed to perform an action based on their tier limits.
 */
export async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  action: "chat" | "ingest"
): Promise<QuotaResult> {
  const { tier, ingestedMinutes, chatQueries } = await ensureUserRecords(
    supabase,
    userId
  );
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

  if (action === "chat" && !limits.chatUnlimited) {
    if (chatQueries >= limits.chatQueries) {
      return {
        allowed: false,
        reason: "chat_limit",
        used: chatQueries,
        limit: limits.chatQueries,
        tier,
      };
    }
  }

  if (action === "ingest") {
    if (ingestedMinutes >= limits.ingestMinutes) {
      return {
        allowed: false,
        reason: "ingest_limit",
        used: ingestedMinutes,
        limit: limits.ingestMinutes,
        tier,
      };
    }
  }

  return { allowed: true, tier };
}

/**
 * Increment the chat query counter for the current billing period.
 */
export async function incrementChatQuery(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.rpc("increment_chat_queries", { p_user_id: userId });
}

/**
 * Add ingested minutes to the cumulative total.
 */
export async function addIngestedMinutes(
  supabase: SupabaseClient,
  userId: string,
  minutes: number
): Promise<void> {
  await supabase.rpc("add_ingested_minutes", {
    p_user_id: userId,
    p_minutes: minutes,
  });
}
