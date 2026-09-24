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
import { getReturnableGrn, listPurchaseOrderGrnsForReturn } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Return to supplier" };

const BASE_PATH = "/purchase-returns/new";

export default async function NewPurchaseReturnPage({ searchParams }: PageProps<"/purchase-returns/new">) {
  await requirePagePermission("return.create");
  const { grnId, code } = await searchParams;

  if (typeof grnId !== "string") {
    return <FindGrn code={typeof code === "string" ? code.trim() : ""} />;
  }
  if (!idSchema.safeParse(grnId).success) notFound();

  const [grn, godowns] = await Promise.all([getReturnableGrn(grnId), listGodowns({ activeOnly: true })]);
  if (!grn) notFound();

  const lines: ReturnableLine[] = grn.items.map((item) => ({
    id: item.id,
    skuCode: item.sku.code,
    skuBarcode: item.sku.barcode,
    skuName: item.sku.name,
    unit: item.sku.baseUom.code,
    batchNumber: item.batch.batchNumber,
    returnable: !item.ledgerEntry || item.ledgerEntry.reversedBy ? "0" : item.acceptedQty.minus(item.returnedQty).toString(),
  }));

  return (
    <>
      <PageHeader
        back={{ href: `/grns/${grn.id}`, label: grn.grnNumber }}
        title="Return to supplier"
        description={`Against ${grn.grnNumber} · ${grn.purchaseOrder.supplier.name}. The returned quantity re-opens on the purchase order.`}
      />
      <ReturnForm
        config={{
          endpoint: "/purchase-returns",
          sourceField: "grnId",
          lineField: "grnItemId",
          godownLabel: "Send from godown",
          submitLabel: "Post return",
        }}
        sourceNumber={grn.grnNumber}
        sourceId={grn.id}
        lines={lines}
        godowns={godowns.map(toNamedOption)}
        defaultGodownId={grn.godownId}
      />
    </>
  );
}

/** Step 1: scan the goods receipt note or the purchase order the goods came in on. */
async function FindGrn({ code }: { code: string }) {
  const found = code ? await findDocumentByCode(code) : null;
  if (found?.type === "GRN") redirect(`${BASE_PATH}?grnId=${found.id}`);

  const grns = found?.type === "PO" ? await listPurchaseOrderGrnsForReturn(found.id) : null;
  const error = !code
    ? null
    : !found
      ? `No document matches "${code}".`
      : found.type !== "PO"
        ? `${found.number} is not a goods receipt or a purchase order.`
        : null;

  return (
    <>
      <PageHeader back={{ href: "/purchase-returns", label: "Supplier returns" }} title="Return to supplier" />
      <ReturnSourceFinder
        basePath={BASE_PATH}
        title="Find the original goods receipt"
        description="Scan the goods receipt note or the purchase order the goods were received against."
        error={error}
        choicesTitle={found ? `Goods receipts against ${found.number}` : undefined}
        choices={grns?.map((g) => ({
          href: `${BASE_PATH}?grnId=${g.id}`,
          number: g.grnNumber,
          detail: `${formatDateTime(g.receivedAt)} · into ${g.godown.name}`,
        }))}
      />
    </>
  );
}
