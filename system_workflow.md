# Margix IMS — Operational Workflow (V1)

Guiding rule: **current stock is never edited; every change is an immutable
ledger transaction.** Each ledger entry stores a signed quantity (+ in, − out)
and the balance of its SKU × godown × batch after the entry.

| Movement | Sign | Created by |
|----------|------|------------|
| OPENING | + | Opening stock (Admin) |
| INWARD | + | GRN — accepted quantity only |
| OUTWARD | − | Dispatch |
| ADJUSTMENT | ± | Approved adjustment |
| REVERSAL | opposite of the entry it reverses | Reversal |
| TRANSFER_OUT / TRANSFER_IN | − / + | Transfer between godowns |
| RETURN_IN | + | Customer return (against a dispatch) |
| RETURN_OUT | − | Supplier return (against a GRN) |

## 1. Procurement and receiving

1. **Purchase order.** A Store Manager creates a PO for a supplier (`DRAFT`,
   editable) and submits it (`OPEN`), or creates it open directly. Draft or open
   orders without receipts can be cancelled with a reason. Lines may be
   entered in an alternate unit of the SKU (e.g. 5 BOX at ₹480 per BOX); the
   order stores the base quantity (120 PCS) and shows what was entered.
2. **Goods receipt (GRN).** When goods arrive, an operator opens the PO,
   chooses the receiving godown and, per line, records batch, dates, the
   **received** quantity and the **accepted** quantity. Any difference needs a
   rejection reason.
3. **Ledger.** One `INWARD` entry per accepted line. Rejected quantity is
   recorded on the GRN but never enters stock.
4. **PO progress.** Accepted quantity accumulates per PO line; the PO moves to
   `PARTIALLY_RECEIVED` or `FULLY_RECEIVED`. Accepting more than is pending is
   refused (`OVER_RECEIPT`). Several GRNs per PO are normal. Each GRN has a
   printable goods receipt note for signatures.
5. **Short-close.** When a supplier will not deliver the balance, a Store
   Manager short-closes a partially received PO (`SHORT_CLOSED`, with a reason);
   no further receipts are accepted.

## 2. Invoices and dispatch

1. **Invoice.** Accounts (or a Store Manager) records what was sold: customer,
   date, SKU lines with quantity and rate (in the base unit or an alternate
   unit). Status `OPEN`.
2. **Dispatch.** The operator selects the godown and, optionally, the invoice
   (the customer then comes from the invoice), and for each line a SKU and a
   **batch** (shown with its available quantity, earliest expiry first;
   expired batches are marked). **Pick batches (FEFO)** fills the lines from the
   earliest-expiring stock automatically and skips expired batches. The posted
   dispatch has a printable delivery challan.
3. **Ledger.** One `OUTWARD` entry per line. If any line exceeds the batch's
   available stock, the whole dispatch is refused (`INSUFFICIENT_STOCK`) —
   negative stock is impossible, even with simultaneous users.
4. **Partial dispatch.** Dispatched quantities are booked against the invoice:
   `PARTIALLY_DISPATCHED` until nothing remains, then `COMPLETE`. Dispatching
   more than remains is refused (`OVER_DISPATCH`). An invoice with nothing
   dispatched can be cancelled.

## 3. Transfers between godowns

1. Choose the source and destination godowns, and batches from the source.
2. Each line posts `TRANSFER_OUT` (source) and `TRANSFER_IN` (destination) in
   one transaction; the batch keeps its identity and company stock is unchanged.
3. Reversing either leg reverses both — stock is never left half-moved.

## 4. Returns

- **Customer return** — from the dispatch: choose lines and quantities (at most
  what was dispatched, net of earlier returns) and the receiving godown. Posts
  `RETURN_IN` into the same batch.
- **Supplier return** — from the GRN: choose lines and quantities (at most the
  accepted quantity, net of earlier returns). Posts `RETURN_OUT`; the returned
  quantity is no longer counted as received on the PO, so a replacement can be
  received.
- A dispatch or GRN line that has returns cannot be reversed until its returns
  are reversed.

## 5. Stock adjustments (approval)

1. **Request.** Staff record the discrepancy: godown, reason (DAMAGE, THEFT,
   EXPIRY, COUNTING_ERROR, OTHER + note) and lines that reduce an existing
   batch or increase a batch. Status `SUBMITTED`; stock is unchanged.
2. **Review.** A Store Manager or Admin — **never the person who submitted
   it** — approves or rejects (rejection needs a note).
3. **Posting.** Approval posts one signed `ADJUSTMENT` entry per line, after
   re-checking that reductions still fit the current stock.

## 6. Corrections (reversals)

1. Find the wrong entry in the stock ledger (or on its document) and choose
   **Reverse**, giving a reason. Only Store Managers and Admins can reverse.
2. A `REVERSAL` entry with the exact opposite quantity is posted and linked to
   the original. The original stays in the ledger, marked "reversed by".
3. The source document follows: a reversed GRN line no longer counts as
   received on its PO, a reversed dispatch line is given back to its invoice,
   and documents show `PARTIALLY_REVERSED` or `REVERSED`.
4. Post the correct transaction. An entry can be reversed only once, and a
   reversal that would make stock negative is refused.

Worked example (spec §14): Opening +500 → GRN +300 → Dispatch −200 →
Damage −25 → mistaken GRN +1000 → Reversal −1000 = **575**.

## 7. Tally Prime synchronisation

1. Every posted document (opening, GRN, dispatch, transfer, return, approved
   adjustment, reversal) is queued for Tally in the same transaction — unless
   its godown has Tally sync disabled.
2. The sync worker (`npm run tally:sync` on a schedule, or **Run sync now** on
   the Tally page) builds a voucher and sends it to Tally.
3. Success → `SYNCED`. Failure → `FAILED` with a plain-language reason (e.g.
   "Item RM-001 is not mapped in Tally."), retried automatically with growing
   intervals. Accounts can fix the mapping and **Retry** at once.
4. Tally problems never block or undo stock transactions.
5. A scheduler runs `npm run tally:sync` every few minutes (see
   docs/operations.md); **Run sync now** is available for Admin and Accounts.

## 8. Low-stock alerts

1. A Store Manager sets a **reorder level** per SKU and godown.
2. Every stock change re-checks the level in the same transaction: when stock
   falls below it, one `LOW_STOCK` alert is raised (never duplicated while the
   condition lasts); when stock recovers, the alert is resolved.
3. Active alerts appear on the dashboard under "Needs attention".

## 9. Reports

| Report | Contents |
|--------|----------|
| Stock summary | Per SKU × godown (or batch) for a period: opening, inward, outward, adjustments, closing |
| Daily inventory | The stock summary for one day |
| Movement report | Every ledger entry in a period with reference and user |
| Slow / dead stock | Stock on hand with no movement for `SLOW_STOCK_DAYS` / `DEAD_STOCK_DAYS` |

Every report can be downloaded as CSV.

## 10. Go-live data

- **Masters by CSV.** An Admin downloads the SKU template, fills it in and
  imports it on the SKU master screen. Every line is checked first (unknown
  unit or category, duplicate code, bad GST rate …); if any line is wrong,
  the problems are listed by line number and nothing is imported.
- **Units.** For each SKU, **Units** adds purchase/sales units with their
  factor (1 BOX = 24 PCS).
- **Opening stock by CSV.** Same approach on the Opening stock screen: one
  file with godown, SKU, batch and quantity; one opening document is posted per
  godown, all or nothing.

## 11. Roles

| Operation | Admin | Store Manager | Warehouse Operator | Accounts | Management |
|-----------|:-----:|:-------------:|:------------------:|:--------:|:----------:|
| View stock, ledger, documents | ✓ | ✓ | ✓ | ✓ | ✓ |
| Purchase orders | ✓ | ✓ | | | |
| GRN, dispatch, adjustment request | ✓ | ✓ | ✓ | | |
| Approve adjustments, reverse entries | ✓ | ✓ | | | |
| Invoices | ✓ | ✓ | | ✓ | |
| Transfers, returns | ✓ | ✓ | ✓ | | |
| Reorder rules | ✓ | ✓ | | | |
| Opening stock, master data, users | ✓ | | | | |
| Tally sync | ✓ | | | ✓ | |
| Audit trail | ✓ | ✓ | | ✓ | |
| Reports, alerts (view) | ✓ | ✓ | ✓ | ✓ | ✓ |
