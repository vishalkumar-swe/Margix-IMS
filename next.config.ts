import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Everything is served by the app itself (fonts are
 * self-hosted by next/font, the barcode engine from /vendor). 'unsafe-inline'
 * scripts are needed by Next.js' inline bootstrap without nonces;
 * 'wasm-unsafe-eval' by the ZXing barcode engine; 'unsafe-eval' only in dev.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera for barcode scanning on this site only; nothing else.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Prefetched pages (see components/layout/navigation-intent.tsx) are reused
    // for at most 30 s — the minimum — so stock figures are never shown stale
    // for long. Visited dynamic pages are always refetched (dynamic: 0).
    staleTimes: { static: 30, dynamic: 0 },
  },
  // Self-contained server bundle for the production container (the Dockerfile
  // sets NEXT_OUTPUT); `next start` keeps working for non-container installs.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Fast deploys build into their own directory (and cache) so they never
  // clobber a local dev/test build (see deploy/deploy.sh).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
