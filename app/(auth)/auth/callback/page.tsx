"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();

    // Supabase JS client automatically detects the hash fragment
    // from the magic link and exchanges it for a session.
    // IMPORTANT: must unsubscribe on unmount — with the singleton client,
    // a stale listener persists and fires router.push("/") on every
    // token refresh, causing unexpected dashboard redirects.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.push("/");
        router.refresh();
      }
    });

    // Also handle the case where the hash contains an error
    const hash = window.location.hash.substring(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const error = params.get("error_description");
      if (error) {
        router.push(`/login?error=${encodeURIComponent(error)}`);
      }
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 mb-4 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <h1 className="text-xl font-semibold">Signing you in...</h1>
        <p className="text-muted-foreground mt-2">
          Please wait while we verify your identity.
        </p>
      </div>
    </div>
  );
}
