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
| TRANSFER_IN/OUT, RETURN_IN/OUT | ± | Reserved for later phases |

## 1. Procurement and receiving

1. **Purchase order.** A Store Manager creates a PO for a supplier (`DRAFT`,
   editable) and submits it (`OPEN`), or creates it open directly. Draft or open
   orders without receipts can be cancelled with a reason.
2. **Goods receipt (GRN).** When goods arrive, an operator opens the PO,
   chooses the receiving godown and, per line, records batch, dates, the
   **received** quantity and the **accepted** quantity. Any difference needs a
   rejection reason.
3. **Ledger.** One `INWARD` entry per accepted line. Rejected quantity is
   recorded on the GRN but never enters stock.
4. **PO progress.** Accepted quantity accumulates per PO line; the PO moves to
   `PARTIALLY_RECEIVED` or `FULLY_RECEIVED`. Accepting more than is pending is
   refused (`OVER_RECEIPT`). Several GRNs per PO are normal.

## 2. Dispatch

1. The operator selects the godown, optional customer and reference, and for
   each line a SKU and a **batch** (shown with its available quantity, earliest
   expiry first).
2. One `OUTWARD` entry per line. If any line exceeds the batch's available
   stock, the whole dispatch is refused (`INSUFFICIENT_STOCK`) — negative stock
   is impossible, even with simultaneous users.

## 3. Stock adjustments (approval)

1. **Request.** Staff record the discrepancy: godown, reason (DAMAGE, THEFT,
   EXPIRY, COUNTING_ERROR, OTHER + note) and lines that reduce an existing
   batch or increase a batch. Status `SUBMITTED`; stock is unchanged.
2. **Review.** A Store Manager or Admin — **never the person who submitted
   it** — approves or rejects (rejection needs a note).
3. **Posting.** Approval posts one signed `ADJUSTMENT` entry per line, after
   re-checking that reductions still fit the current stock.

## 4. Corrections (reversals)

1. Find the wrong entry in the stock ledger (or on its document) and choose
   **Reverse**, giving a reason. Only Store Managers and Admins can reverse.
2. A `REVERSAL` entry with the exact opposite quantity is posted and linked to
   the original. The original stays in the ledger, marked "reversed by".
3. The source document follows: a reversed GRN line no longer counts as
   received on its PO, and documents show `PARTIALLY_REVERSED` or `REVERSED`.
4. Post the correct transaction. An entry can be reversed only once, and a
   reversal that would make stock negative is refused.

Worked example (spec §14): Opening +500 → GRN +300 → Dispatch −200 →
Damage −25 → mistaken GRN +1000 → Reversal −1000 = **575**.

## 5. Tally Prime synchronisation

1. Every posted document (opening, GRN, dispatch, approved adjustment,
   reversal) is queued for Tally in the same transaction — unless its godown
   has Tally sync disabled.
2. The sync worker (`npm run tally:sync` on a schedule, or **Run sync now** on
   the Tally page) builds a voucher and sends it to Tally.
3. Success → `SYNCED`. Failure → `FAILED` with a plain-language reason (e.g.
   "Item RM-001 is not mapped in Tally."), retried automatically with growing
   intervals. Accounts can fix the mapping and **Retry** at once.
4. Tally problems never block or undo stock transactions.

## 6. Roles

| Operation | Admin | Store Manager | Warehouse Operator | Accounts | Management |
|-----------|:-----:|:-------------:|:------------------:|:--------:|:----------:|
| View stock, ledger, documents | ✓ | ✓ | ✓ | ✓ | ✓ |
| Purchase orders | ✓ | ✓ | | | |
| GRN, dispatch, adjustment request | ✓ | ✓ | ✓ | | |
| Approve adjustments, reverse entries | ✓ | ✓ | | | |
| Opening stock, master data, users | ✓ | | | | |
| Tally sync | ✓ | | | ✓ | |
