import { createBrowserClient as createClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton — prevents multiple Supabase client instances from contending
// on the Navigator LockManager for auth token refresh, which caused
// unhandled promise rejections and mid-upload page redirects.
let client: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ) as SupabaseClient;
  }
  return client;
}
