import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Quantity } from "@/components/shared/quantity";
import { ReasonActionButton } from "@/components/shared/reason-action-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { OpeningStockImportDialog } from "@/features/imports/import-dialogs";
import { OpeningLineEditDialog } from "@/features/opening/opening-line-edit-dialog";
import { formatDate, formatDateTime, istDateOf, todayIst } from "@/lib/dates";
import { formatEntryNo } from "@/lib/format";
import { parseSearchParams } from "@/lib/search-params";
import { openingLineListQuerySchema } from "@/lib/validation/opening";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { listOpeningLines } from "@/server/modules/opening/opening.queries";

export const metadata: Metadata = { title: "Opening stock" };

export default async function OpeningStockPage({ searchParams }: PageProps<"/opening-stock">) {
  await requirePagePermission("opening.post");
  const raw = await searchParams;
  const query = parseSearchParams(openingLineListQuerySchema, raw);
  const [{ items, total }, godowns] = await Promise.all([listOpeningLines(query), listGodowns()]);
  const filtered = Boolean(query.q || query.godownId || query.state);

  const newButton = (
    <Link href="/opening-stock/new" className={buttonVariants()}>
      <Plus aria-hidden /> Post opening stock
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Opening stock"
        description="Go-live balances, line by line. Each line is an OPENING entry in the stock ledger and counts in Stock immediately. Edit and Delete post corrections; the original stays in the history."
        actions={
          <>
            <OpeningStockImportDialog today={todayIst()} />
            {newButton}
          </>
        }
      />
      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "SKU, batch, document or barcode", value: query.q }}
          selects={[
            {
              name: "godownId",
              label: "All godowns",
              value: query.godownId,
              options: godowns.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            },
            {
              name: "state",
              label: "All lines",
              value: query.state,
              options: [
                { value: "active", label: "In effect" },
                { value: "reversed", label: "Removed or corrected" },
              ],
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>SKU</TH>
                  <TH>Godown · batch</TH>
                  <TH numeric>Quantity</TH>
                  <TH>Document</TH>
                  <TH>Posted</TH>
                  <TH>Status</TH>
                  <TH className="sr-only">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((line) => {
                  const doc = line.openingBalance;
                  const reversal = line.ledgerEntry.reversedBy;
                  return (
                    <TR key={line.id} className={reversal ? "bg-slate-50/60 text-slate-500" : undefined}>
                      <TD>
                        <Link href={`/stock/${line.sku.id}`} className="font-medium text-slate-900 hover:underline">
                          {line.sku.code}
                        </Link>
                        <span className="block text-xs text-slate-500">{line.sku.name}</span>
                      </TD>
                      <TD className="text-xs">
                        {doc.godown.name}
                        <span className="block font-mono">{line.batch.batchNumber}</span>
                        {line.batch.expiryDate && <span className="block text-slate-500">exp {formatDate(line.batch.expiryDate)}</span>}
                      </TD>
                      <TD numeric>
                        <Quantity value={line.quantity} unit={line.sku.baseUom.code} className={reversal ? "line-through" : undefined} />
                      </TD>
                      <TD className="text-xs">
                        <Link
                          href={`/ledger?referenceNo=${encodeURIComponent(doc.openingNumber)}`}
                          className="font-mono font-medium text-brand-700 hover:underline"
                        >
                          {doc.openingNumber}
                        </Link>
                        <span className="block text-slate-500">
                          as of {formatDate(doc.asOf)} · {formatEntryNo(line.ledgerEntry.entryNo)}
                        </span>
                        {line.replaces && <span className="block text-slate-500">Corrects {line.replaces.openingBalance.openingNumber}</span>}
                      </TD>
                      <TD className="text-xs">
                        {doc.createdBy.name}
                        <span className="block text-slate-500">{formatDateTime(doc.createdAt)}</span>
                      </TD>
                      <TD className="text-xs">
                        {reversal ? (
                          <>
                            <Badge tone="neutral">{line.replacedBy ? "Corrected" : "Removed"}</Badge>
                            <span className="mt-1 block text-slate-500">
                              {line.replacedBy ? `by ${line.replacedBy.openingBalance.openingNumber} · ` : ""}
                              {reversal.createdBy.name}, {formatDateTime(reversal.createdAt)}
                            </span>
                            {reversal.remarks && <span className="block text-slate-500">{reversal.remarks}</span>}
                          </>
                        ) : (
                          <Badge tone="success">In effect</Badge>
                        )}
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        {!reversal && (
                          <>
                            <OpeningLineEditDialog
                              itemId={line.id}
                              label={`${line.sku.code} · ${line.batch.batchNumber} · ${doc.openingNumber}`}
                              unit={line.sku.baseUom.code}
                              isBatchTracked={line.sku.isBatchTracked}
                              initial={{
                                quantity: line.quantity.toString(),
                                batchNumber: line.sku.isBatchTracked ? line.batch.batchNumber : "",
                                manufacturingDate: line.batch.manufacturingDate ? istDateOf(line.batch.manufacturingDate) : "",
                                expiryDate: line.batch.expiryDate ? istDateOf(line.batch.expiryDate) : "",
                              }}
                            />
                            <ReasonActionButton
                              endpoint={`/opening-balances/lines/${line.id}/void`}
                              label="Delete"
                              variant="ghost"
                              icon={<Trash2 aria-hidden />}
                              title="Remove opening stock line"
                              description={`${line.sku.code} · ${line.batch.batchNumber}: the line is reversed and its quantity leaves stock. It stays visible here as "Removed". Refused if the stock has already been used.`}
                              confirmLabel="Remove line"
                            />
                          </>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/opening-stock" searchParams={raw} />
          </>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title={filtered ? "No matching opening lines" : "No opening stock posted"}
            action={filtered ? undefined : newButton}
          />
        )}
      </Card>
    </>
  );
}
