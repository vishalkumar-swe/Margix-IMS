import Link from "next/link";
import { MovementBadge } from "@/components/shared/status-badge";
import { Quantity } from "@/components/shared/quantity";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { formatEntryNo } from "@/lib/format";
import type { LedgerEntryView } from "@/server/modules/inventory/ledger.queries";
import { ReferenceLink } from "./reference-link";
import { ReverseEntryButton } from "./reverse-entry-button";

/**
 * Ledger entries with signed quantities, running balance and reversal links.
 * `canReverse` shows the Reverse action on entries that are still reversible.
 */
export function LedgerTable({
  entries,
  canReverse = false,
  showSku = true,
}: {
  entries: LedgerEntryView[];
  canReverse?: boolean;
  showSku?: boolean;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Entry</TH>
          <TH>Date</TH>
          <TH>Type</TH>
          {showSku && <TH>SKU</TH>}
          <TH>Godown / batch</TH>
          <TH numeric>Quantity</TH>
          <TH numeric>Balance</TH>
          <TH>Reference</TH>
          <TH>By</TH>
          {canReverse && <TH className="sr-only">Actions</TH>}
        </tr>
      </THead>
      <TBody>
        {entries.map((entry) => {
          const reversible = canReverse && entry.movementType !== "REVERSAL" && !entry.reversedBy;
          return (
            <TR key={entry.id} className={entry.reversedBy ? "bg-slate-50/80 text-slate-400" : undefined}>
              <TD className="font-mono text-xs whitespace-nowrap">
                {formatEntryNo(entry.entryNo)}
                {entry.reversesEntry && (
                  <span className="block text-slate-400">reverses {formatEntryNo(entry.reversesEntry.entryNo)}</span>
                )}
                {entry.reversedBy && (
                  <span className="block text-red-600">reversed by {formatEntryNo(entry.reversedBy.entryNo)}</span>
                )}
              </TD>
              <TD className="text-xs whitespace-nowrap">{formatDateTime(entry.createdAt)}</TD>
              <TD>
                <MovementBadge type={entry.movementType} />
                {entry.reasonCode && <span className="mt-1 block text-xs text-slate-500">{entry.reasonCode}</span>}
              </TD>
              {showSku && (
                <TD>
                  <Link href={`/stock/${entry.sku.id}`} className="font-medium text-slate-900 hover:underline">
                    {entry.sku.code}
                  </Link>
                  <span className="block text-xs text-slate-500">{entry.sku.name}</span>
                </TD>
              )}
              <TD className="text-xs">
                {entry.godown.code}
                <span className="block text-slate-500">{entry.batch.batchNumber}</span>
              </TD>
              <TD numeric>
                <Quantity value={entry.quantity} signed />
              </TD>
              <TD numeric>
                <Quantity value={entry.balanceAfter} unit={entry.sku.baseUom.code} />
              </TD>
              <TD>
                <ReferenceLink type={entry.referenceType} id={entry.referenceId} no={entry.referenceNo} />
                {entry.remarks && <span className="block max-w-48 truncate text-xs text-slate-500">{entry.remarks}</span>}
              </TD>
              <TD className="text-xs whitespace-nowrap">{entry.createdBy.name}</TD>
              {canReverse && (
                <TD className="text-right">
                  {reversible && (
                    <ReverseEntryButton
                      entryId={entry.id}
                      entryNo={entry.entryNo.toString()}
                      quantity={entry.quantity.toString()}
                      description={`${entry.movementType} of ${entry.quantity.toString()} ${entry.sku.baseUom.code} ${entry.sku.code} in ${entry.godown.code} / ${entry.batch.batchNumber} (${entry.referenceNo}).`}
                    />
                  )}
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
