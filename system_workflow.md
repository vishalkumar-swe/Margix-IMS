# Margix Inventory V1 Workflow Guide

This guide outlines the end-to-end operational workflow of the Margix Inventory system. It follows the core philosophy: **"Current stock is never edited directly; every change is an immutable ledger transaction."**

## 1. Procurement & Inward Flow (GRN)
When new stock arrives from suppliers, the system processes it as an Inward transaction.

1. **Purchase Order (PO):** A PO is created against a Supplier. Its status is `OPEN`.
2. **Goods Receipt Note (GRN):** When physical goods arrive at the Godown, a GRN is posted against the PO. 
3. **Ledger Update:** The system automatically creates an `INWARD` entry in the `InventoryLedger` for that specific Godown.
4. **PO Status:** The PO automatically updates to `PARTIALLY_RECEIVED` or `FULLY_RECEIVED` based on the received quantities.

## 2. Dispatch & Outward Flow
When stock leaves the warehouse (e.g., sent to production or dispatched to a customer).

1. **Dispatch Entry:** A dispatch transaction is recorded indicating which SKUs are leaving and from which Godown.
2. **Ledger Update:** The system creates an `OUTWARD` entry in the `InventoryLedger`.
3. **Validation:** The system ensures that the absolute quantity is recorded, but dynamically treats it as a negative impact on the running balance during stock calculation.

## 3. Stock Adjustment Flow (Approvals)
When physical stock doesn't match system stock due to damage, theft, expiry, or counting errors.

1. **Submission:** A user submits an `AdjustmentRequest` detailing the SKU, Godown, Variance Quantity, and Reason Code (e.g., `DAMAGE`, `THEFT`). The status is `SUBMITTED`.
2. **Approval (Store Manager):** A manager reviews the request in the Adjustments dashboard.
3. **Ledger Update:** Upon clicking **Approve**, the system automatically creates an `ADJUSTMENT` movement in the `InventoryLedger` linked to the request. The request status becomes `APPROVED`.

## 4. Error Correction (Self-Healing Reversals)
If a user makes a mistake (e.g., wrong quantity on a GRN or wrong Godown on a dispatch).

1. **Identify Mistake:** The user locates the incorrect transaction in the Stock Ledger.
2. **Reverse:** The user triggers a Reversal. 
3. **Counter-Entry:** The system does *not* delete the old record. Instead, it generates a `REVERSAL` entry in the ledger that perfectly negates the impact of the original transaction, leaving a pristine audit trail.
4. **Re-enter:** The user creates a new, correct transaction.

## 5. Tally Prime Integration (Background Sync)
Bridging the gap between the operational warehouse and financial accounting.

1. **Queueing:** Every new ledger entry (`INWARD`, `OUTWARD`, `ADJUSTMENT`) is created with a `syncStatus: PENDING`.
2. **Processing:** The Tally Sync Engine (accessible via the API/Dashboard) picks up all pending entries.
3. **XML Generation:** Entries are mapped to Tally XML formats based on `tallyMappingId`.
4. **Result:** Successfully pushed entries are marked `SYNCED`. If Tally rejects them, they are marked `FAILED` with the error reason, allowing the team to retry later.

---

> [!TIP]
> **Stock Math Rule**
> The system calculates your current stock in real-time by aggregating these ledger entries. 
> `Total Stock = (Opening + Inward + Transfer In) - (Outward + Transfer Out + Adjustments)`
