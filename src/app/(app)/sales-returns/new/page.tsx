import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnForm, type ReturnableLine } from "@/features/returns/return-form";
import { toNamedOption } from "@/lib/options";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";
import { getReturnableDispatch } from "@/server/modules/returns/returns.queries";

export const metadata: Metadata = { title: "Record customer return" };

export default async function NewSalesReturnPage({ searchParams }: PageProps<"/sales-returns/new">) {
  await requirePagePermission("return.create");
  const { outwardId } = await searchParams;
  if (typeof outwardId !== "string" || !idSchema.safeParse(outwardId).success) notFound();

  const [dispatch, godowns] = await Promise.all([getReturnableDispatch(outwardId), listGodowns({ activeOnly: true })]);
  if (!dispatch) notFound();

  const lines: ReturnableLine[] = dispatch.items.map((item) => ({
    id: item.id,
    skuCode: item.sku.code,
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
        sourceId={dispatch.id}
        lines={lines}
        godowns={godowns.map(toNamedOption)}
        defaultGodownId={dispatch.godownId}
      />
    </>
  );
}
