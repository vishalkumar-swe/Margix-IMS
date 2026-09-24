import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { LabelPicker } from "@/features/masters/label-picker";
import { requirePagePermission } from "@/server/auth/current-user";
import { listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Print product labels" };

export default async function ProductLabelsPage() {
  await requirePagePermission("master.view");
  const skus = await listSkuOptions();

  return (
    <>
      <PageHeader
        back={{ href: "/masters/skus", label: "Products (SKUs)" }}
        title="Print product labels"
        description="Barcode labels with the product name and code. Products without a barcode print their SKU code, which scans just as well."
      />
      <LabelPicker products={skus.map(({ id, code, name, barcode }) => ({ id, code, name, barcode }))} />
    </>
  );
}
