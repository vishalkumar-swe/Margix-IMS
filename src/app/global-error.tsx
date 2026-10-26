"use client";

/**
 * Last-resort boundary: it replaces the root layout, so it must render its own
 * <html>/<body> and must not depend on globals.css (which lives in that layout).
 * Everything here is inline styled on purpose.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f6f5f1",
          color: "#0f172a",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: 1.5, color: "#475569" }}>
            Margix India could not be loaded.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.25rem",
              height: "2.25rem",
              padding: "0 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              background: "#fcbc00",
              color: "#000",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
