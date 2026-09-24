"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateMovementModalProps = {
  skus: { id: string; name: string; productCode: string }[];
  godowns: { id: string; name: string }[];
  batches?: { id: string; batchNumber: string; skuId: string }[];
};

export default function CreateMovementModal({ skus, godowns, batches = [] }: CreateMovementModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState("INWARD");
  const [selectedSkuId, setSelectedSkuId] = useState(skus[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const payload: any = {
      skuId: selectedSkuId,
      godownId: formData.get("godownId"),
      quantity: Number(formData.get("quantity")),
      actor: "warehouse_user", // Hardcoded for demo
      referenceType: type, // Passed directly to the ledger
      referenceId: formData.get("referenceId") || "REF-" + Date.now(),
    };

    const isInward = ["OPENING_STOCK", "INWARD", "CUSTOMER_RETURN"].includes(type);
    const isOutward = ["CONSUMPTION", "OUTWARD"].includes(type);

    if (isInward) {
      payload.batchNumber = formData.get("batchNumber");
      payload.manufacturingDate = formData.get("manufacturingDate");
      payload.expiryDate = formData.get("expiryDate");
    } else if (isOutward) {
      payload.batchId = formData.get("batchId");
    } else if (type === "ADJUSTMENT") {
      payload.reason = formData.get("reason");
      payload.submittedBy = "warehouse_user";
    }

    let endpoint = "/api/grn";
    if (isOutward) endpoint = "/api/outward";
    if (type === "ADJUSTMENT") endpoint = "/api/adjustments";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        setIsOpen(false);
        router.refresh(); // Refresh server component data
      } else {
        const error = await res.json();
        alert("Error: " + error.error);
      }
    } catch (err) {
      alert("Failed to submit movement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className="btn-primary" onClick={() => setIsOpen(true)}>
        + Create Movement
      </button>

      {isOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.6)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)"
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "500px", transform: "translateY(0)", opacity: 1, transition: "all 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>Create Movement</h2>
              <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-muted)" }}>&times;</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Transaction Type</label>
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}
                >
                  <optgroup label="Add to Stock (+)">
                    <option value="OPENING_STOCK">Opening Stock</option>
                    <option value="INWARD">Inward / GRN</option>
                    <option value="CUSTOMER_RETURN">Customer Return</option>
                  </optgroup>
                  <optgroup label="Deduct from Stock (-)">
                    <option value="CONSUMPTION">Production Consumption</option>
                    <option value="OUTWARD">Sales / Outward</option>
                  </optgroup>
                  <optgroup label="Corrections (±)">
                    <option value="ADJUSTMENT">Stock Adjustment (Damage/Expiry/Theft)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>SKU</label>
                <select 
                  name="skuId" 
                  required 
                  value={selectedSkuId}
                  onChange={(e) => setSelectedSkuId(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}
                >
                  {skus.map(s => (
                    <option key={s.id} value={s.id}>{s.productCode} - {s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Godown</label>
                <select name="godownId" required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                  {godowns.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Quantity (Base Unit)</label>
                <input type="number" name="quantity" min="1" required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }} />
              </div>

              {["OPENING_STOCK", "INWARD", "CUSTOMER_RETURN"].includes(type) && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Batch Number</label>
                    <input type="text" name="batchNumber" required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }} placeholder="e.g. BATCH-123" />
                  </div>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Mfg Date</label>
                      <input type="date" name="manufacturingDate" style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Expiry Date</label>
                      <input type="date" name="expiryDate" required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }} />
                    </div>
                  </div>
                </>
              )}

              {["CONSUMPTION", "OUTWARD"].includes(type) && (
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Select Batch</label>
                  <select name="batchId" required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <option value="">-- Select Batch --</option>
                    {batches.filter(b => b.skuId === selectedSkuId).map(b => (
                      <option key={b.id} value={b.id}>{b.batchNumber}</option>
                    ))}
                  </select>
                </div>
              )}

              {type === "ADJUSTMENT" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "0.25rem" }}>Reason Code</label>
                  <select name="reason" required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <option value="Damage">Damage</option>
                    <option value="Theft/Shrinkage">Theft/Shrinkage</option>
                    <option value="Expiry">Expiry</option>
                    <option value="Count Correction">Count Correction</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: "1rem", justifyContent: "center" }}>
                {loading ? "Submitting..." : (type === "ADJUSTMENT" ? "Submit Request" : "Post to Ledger")}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
