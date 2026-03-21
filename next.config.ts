import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withSentryConfig(nextConfig, {
  // Disable source map uploads — no auth token in zero-config mode
  sourcemaps: { disable: true },
  // Disable telemetry to Sentry's servers
  telemetry: false,
  // Suppress build logs about missing SENTRY_AUTH_TOKEN
  silent: true,
});
