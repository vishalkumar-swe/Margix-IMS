import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnForm, type ReturnableLine } from "@/features/returns/return-form";
import { ReturnSourceFinder } from "@/features/returns/return-source-finder";
import { formatDateTime } from "@/lib/dates";
import { toNamedOption } from "@/lib/options";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { findDocumentByCode } from "@/server/modules/documents/documents.queries";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { getReturnableDispatch, listInvoiceDispatchesForReturn } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Record customer return" };

const BASE_PATH = "/sales-returns/new";

export default async function NewSalesReturnPage({ searchParams }: PageProps<"/sales-returns/new">) {
  await requirePagePermission("return.create");
  const { outwardId, code } = await searchParams;

  if (typeof outwardId !== "string") {
    return <FindDispatch code={typeof code === "string" ? code.trim() : ""} />;
  }
  if (!idSchema.safeParse(outwardId).success) notFound();

  const [dispatch, godowns] = await Promise.all([getReturnableDispatch(outwardId), listGodowns({ activeOnly: true })]);
  if (!dispatch) notFound();

  const lines: ReturnableLine[] = dispatch.items.map((item) => ({
    id: item.id,
    skuCode: item.sku.code,
    skuBarcode: item.sku.barcode,
    skuName: item.sku.name,
    unit: item.sku.baseUom.code,
    batchNumber: item.batch.batchNumber,
    returnable: item.ledgerEntry.reversedBy ? "0" : item.quantity.minus(item.returnedQty).toString(),
  }));

  return (
    <>
      <PageHeader
        back={{ href: `/dispatches/${dispatch.id}`, label: dispatch.outwardNumber }}
        title="Record customer return"
        description={`Against ${dispatch.outwardNumber}${dispatch.customer ? ` · ${dispatch.customer.name}` : ""}`}
      />
      <ReturnForm
        config={{
          endpoint: "/sales-returns",
          sourceField: "outwardId",
          lineField: "outwardItemId",
          godownLabel: "Receive into godown",
          submitLabel: "Post return",
        }}
        sourceNumber={dispatch.outwardNumber}
        sourceId={dispatch.id}
        lines={lines}
        godowns={godowns.map(toNamedOption)}
        defaultGodownId={dispatch.godownId}
      />
    </>
  );
}

/** Step 1: scan the delivery challan (dispatch) or the invoice the goods were sold on. */
async function FindDispatch({ code }: { code: string }) {
  const found = code ? await findDocumentByCode(code) : null;
  if (found?.type === "DSP") redirect(`${BASE_PATH}?outwardId=${found.id}`);

  const dispatches = found?.type === "INV" ? await listInvoiceDispatchesForReturn(found.id) : null;
  const error = !code
    ? null
    : !found
      ? `No document matches "${code}".`
      : found.type !== "INV"
        ? `${found.number} is not a dispatch or an invoice.`
        : null;

  return (
    <>
      <PageHeader back={{ href: "/sales-returns", label: "Customer returns" }} title="Record customer return" />
      <ReturnSourceFinder
        basePath={BASE_PATH}
        title="Find the original dispatch"
        description="Scan the delivery challan or the tax invoice the goods went out on."
        error={error}
        choicesTitle={found ? `Dispatches against ${found.number}` : undefined}
        choices={dispatches?.map((d) => ({
          href: `${BASE_PATH}?outwardId=${d.id}`,
          number: d.outwardNumber,
          detail: `${formatDateTime(d.dispatchedAt)} · from ${d.godown.name}`,
        }))}
      />
    </>
  );
}
