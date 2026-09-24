import { formatEntryNo } from "@/lib/format";
import { toCsv } from "@/server/http/csv";
import type { LedgerEntryView } from "@/server/modules/inventory/ledger.queries";
import type { StockAgingRow, StockSummaryRow } from "./reports.queries";

/** CSV layouts for report downloads (column order = on-screen order). */

export function stockSummaryCsv(rows: StockSummaryRow[], byBatch: boolean): string {
  return toCsv<StockSummaryRow>(
    [
      { header: "SKU", value: (r) => r.skuCode },
      { header: "Name", value: (r) => r.skuName },
      { header: "Godown", value: (r) => r.godownCode },
      ...(byBatch ? [{ header: "Batch", value: (r: StockSummaryRow) => r.batchNumber }] : []),
      { header: "Unit", value: (r) => r.unit },
      { header: "Opening", value: (r) => r.opening },
      { header: "Inward", value: (r) => r.inward },
      { header: "Outward", value: (r) => r.outward },
      { header: "Adjustments", value: (r) => r.adjustments },
      { header: "Closing", value: (r) => r.closing },
    ],
    rows,
  );
}

export function movementReportCsv(entries: LedgerEntryView[]): string {
  return toCsv<LedgerEntryView>(
    [
      { header: "Entry", value: (e) => formatEntryNo(e.entryNo) },
      { header: "Date", value: (e) => e.createdAt },
      { header: "SKU", value: (e) => e.sku.code },
      { header: "Batch", value: (e) => e.batch.batchNumber },
      { header: "Godown", value: (e) => e.godown.code },
      { header: "Movement", value: (e) => e.movementType },
      { header: "Quantity", value: (e) => e.quantity },
      { header: "Balance after", value: (e) => e.balanceAfter },
      { header: "Unit", value: (e) => e.sku.baseUom.code },
      { header: "Reference", value: (e) => e.referenceNo },
      { header: "Reason", value: (e) => e.reasonCode },
      { header: "User", value: (e) => e.createdBy.name },
      { header: "Remarks", value: (e) => e.remarks },
    ],
    entries,
  );
}

export function stockAgingCsv(rows: StockAgingRow[]): string {
  return toCsv<StockAgingRow>(
    [
      { header: "SKU", value: (r) => r.skuCode },
      { header: "Name", value: (r) => r.skuName },
      { header: "Godown", value: (r) => r.godownCode },
      { header: "Quantity", value: (r) => r.quantity },
      { header: "Unit", value: (r) => r.unit },
      { header: "Last movement", value: (r) => r.lastMovementAt },
      { header: "Days since movement", value: (r) => r.daysIdle },
    ],
    rows,
  );
}
