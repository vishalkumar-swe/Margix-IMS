import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_URL ?? "https://ims.margixindia.com";

/** Only the marketing page is public; every application route is behind a session. */
const PRIVATE_PREFIXES = [
  "/api/",
  "/login",
  "/dashboard",
  "/stock",
  "/masters",
  "/reports",
  "/analytics",
  "/ledger",
  "/alerts",
  "/audit",
  "/tally",
  "/admin",
  "/account",
  "/purchase-orders",
  "/grns",
  "/invoices",
  "/dispatches",
  "/transfers",
  "/adjustments",
  "/purchase-returns",
  "/sales-returns",
  "/opening-stock",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PREFIXES }],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
