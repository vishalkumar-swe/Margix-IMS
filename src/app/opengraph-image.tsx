import { ImageResponse } from "next/og";

export const alt = "Margix India — inventory, purchasing and dispatch on one ledger";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CAPABILITIES = ["Stock", "Purchasing", "Dispatch", "GST invoices", "Reports"];

/** Social preview for the landing page (Open Graph / Twitter). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 72,
          background: "#0c0d0f",
          color: "#f8f9fa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 76,
              height: 76,
              borderRadius: 20,
              background: "#fcbc00",
              color: "#000000",
              fontSize: 46,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>Margix India</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2, maxWidth: 940 }}>
            Inventory, purchasing and dispatch on one ledger
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#9aa3ae" }}>
            Real-time stock across godowns, GST billing and Tally sync
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {CAPABILITIES.map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(252,188,0,0.12)",
                color: "#ffd34a",
                fontSize: 24,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
