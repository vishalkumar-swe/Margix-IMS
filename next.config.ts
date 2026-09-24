import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Prefetched pages (see components/layout/navigation-intent.tsx) are reused
    // for at most 30 s — the minimum — so stock figures are never shown stale
    // for long. Visited dynamic pages are always refetched (dynamic: 0).
    staleTimes: { static: 30, dynamic: 0 },
  },
  // Self-contained server bundle for the production container (the Dockerfile
  // sets NEXT_OUTPUT); `next start` keeps working for non-container installs.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
