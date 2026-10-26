import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Margix India — Inventory Management",
    short_name: "Margix IMS",
    description: "Ledger-based inventory management — purchasing, stock, dispatch and GST billing.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#fcbc00",
    icons: [{ src: "/brand/margix-mark.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
