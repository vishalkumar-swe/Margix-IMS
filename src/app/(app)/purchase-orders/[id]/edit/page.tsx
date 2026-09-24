import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseOrderForm } from "@/features/purchasing/purchase-order-form";
import { utcToDateOnly } from "@/lib/dates";
import { toPartyOption, toSkuOption } from "@/lib/options";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { listSkuOptions, listSuppliers } from "@/server/modules/masters/masters.queries";
import { getPurchaseOrderDetail } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]/edit">) {
  await requirePagePermission("po.manage");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const po = await getPurchaseOrderDetail(id);
  if (!po) notFound();
  if (po.status !== "DRAFT") redirect(`/purchase-orders/${id}`);

  const [suppliers, skus] = await Promise.all([listSuppliers({ activeOnly: true }), listSkuOptions()]);

  return (
    <>
      <PageHeader back={{ href: `/purchase-orders/${id}`, label: po.poNumber }} title={`Edit ${po.poNumber}`} />
      <PurchaseOrderForm
        purchaseOrderId={id}
        suppliers={suppliers.map(toPartyOption)}
        skus={skus.map(toSkuOption)}
        companyStateCode={getCompanyDetails().stateCode ?? null}
        initial={{
          supplierId: po.supplierId,
          orderDate: utcToDateOnly(po.orderDate),
          expectedDate: po.expectedDate ? utcToDateOnly(po.expectedDate) : "",
          remarks: po.remarks ?? "",
          otherCharges: {
            amount: po.otherCharges.isZero() ? "" : po.otherCharges.toString(),
            label: po.otherChargesLabel ?? "",
          },
          items: po.items.map((item) => ({
            skuId: item.skuId,
            // Re-open the line in the unit it was entered in (rate is per that unit).
            quantity: (item.entryQuantity ?? item.orderedQty).toString(),
            uomId: item.entryUomId ?? "",
            rate: item.rate?.toString() ?? "",
            discountPercent: item.discountPercent.isZero() ? "" : item.discountPercent.toString(),
            gstRate: item.gstRate?.toString() ?? "",
          })),
        }}
      />
    </>
  );
}
