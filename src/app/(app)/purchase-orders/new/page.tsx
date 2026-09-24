import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PurchaseOrderForm } from "@/features/purchasing/purchase-order-form";
import { todayIst } from "@/lib/dates";
import { toPartyOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { listSkuOptions, listSuppliers } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  await requirePagePermission("po.manage");
  const [suppliers, skus] = await Promise.all([listSuppliers({ activeOnly: true }), listSkuOptions()]);

  return (
    <>
      <PageHeader back={{ href: "/purchase-orders", label: "Purchase orders" }} title="New purchase order" />
      <PurchaseOrderForm
        suppliers={suppliers.map(toPartyOption)}
        skus={skus.map(toSkuOption)}
        companyStateCode={getCompanyDetails().stateCode ?? null}
        initial={{
          supplierId: "",
          orderDate: todayIst(),
          expectedDate: "",
          remarks: "",
          otherCharges: { amount: "", label: "" },
          items: [],
        }}
      />
    </>
  );
}
