import { createBrowserClient as createClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Singleton with Navigator Lock disabled.
// The Supabase GoTrue client uses the Web Locks API for cross-tab session
// synchronization. This throws "Acquiring an exclusive Navigator LockManager
// lock immediately failed" errors that crash the auth state and cause
// mid-upload page redirects. Since this is a single-tab app, we disable
// the lock entirely with a no-op function.
let client: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          lock: async (
            _name: string,
            _acquireTimeout: number,
            fn: () => Promise<any> // GoTrue LockFunc generic requires any
          ) => {
            return await fn();
          },
        },
      }
    ) as SupabaseClient;
  }
  return client;
}
