import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseOrderForm } from "@/features/purchasing/purchase-order-form";
import { todayIst } from "@/lib/dates";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { parseSearchParams } from "@/lib/search-params";
import { newPoQuerySchema } from "@/lib/validation/purchasing";
import { requirePagePermission } from "@/server/auth/current-user";
import { suggestedReorderQuantity } from "@/server/modules/alerts/alerts.queries";
import { listSkuOptions, listSuppliers } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "New purchase order" };

/** `?skuId=` (reorder from an alert or report) pre-fills a line with the shortfall to the reorder level. */
export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchase-orders/new">) {
  await requirePagePermission("po.manage");
  const query = parseSearchParams(newPoQuerySchema, await searchParams);
  const [suppliers, skus] = await Promise.all([listSuppliers({ activeOnly: true }), listSkuOptions()]);
  const skuOptions = skus.map(toSkuOption);
  const reorderSku = query.skuId ? skuOptions.find((s) => s.id === query.skuId) : undefined;
  const quantity = reorderSku ? await suggestedReorderQuantity(reorderSku.id) : null;

  return (
    <>
      <PageHeader back={{ href: "/purchase-orders", label: "Purchase orders" }} title="New purchase order" />
      <PurchaseOrderForm
        suppliers={suppliers.map(toNamedOption)}
        skus={skuOptions}
        initial={{
          supplierId: "",
          orderDate: todayIst(),
          expectedDate: "",
          remarks: "",
          items: reorderSku
            ? [{ skuId: reorderSku.id, quantity: quantity ?? "", uomId: "", rate: "", gstRate: reorderSku.gstRate ?? "" }]
            : [],
        }}
      />
    </>
  );
}
