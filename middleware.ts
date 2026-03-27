import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser icon)
     * - api/ (all API routes — they have their own auth checks returning 401 JSON)
     *
     * API routes are excluded to prevent the middleware auth redirect from
     * intercepting background fetches (e.g., 5-second /api/videos poll),
     * which caused mid-upload page redirects when the JWT cookie expired.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
