"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RetrySyncButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRetry = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tally/sync", { method: "POST" });
      const data = await res.json();
      
      if (res.ok) {
        alert(`Sync complete! Success: ${data.successCount}, Failed: ${data.failedCount}`);
        router.refresh();
      } else {
        alert("Sync failed to run.");
      }
    } catch (err) {
      alert("Error calling sync API.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      className="btn-outline" 
      onClick={handleRetry}
      disabled={loading}
      style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
    >
      {loading ? "Syncing..." : "Retry all syncs"}
    </button>
  );
}
