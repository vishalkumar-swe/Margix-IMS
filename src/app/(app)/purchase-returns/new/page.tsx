import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnForm, type ReturnableLine } from "@/features/returns/return-form";
import { toNamedOption } from "@/lib/options";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { getReturnableGrn } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Return to supplier" };

export default async function NewPurchaseReturnPage({ searchParams }: PageProps<"/purchase-returns/new">) {
  await requirePagePermission("return.create");
  const { grnId } = await searchParams;
  if (typeof grnId !== "string" || !idSchema.safeParse(grnId).success) notFound();

  const [grn, godowns] = await Promise.all([getReturnableGrn(grnId), listGodowns({ activeOnly: true })]);
  if (!grn) notFound();

  const lines: ReturnableLine[] = grn.items.map((item) => ({
    id: item.id,
    skuCode: item.sku.code,
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
        sourceId={grn.id}
        lines={lines}
        godowns={godowns.map(toNamedOption)}
        defaultGodownId={grn.godownId}
      />
    </>
  );
}
