import type { Metadata } from "next";
import Link from "next/link";
import { ProductLabelSheet, repeatLabels } from "@/features/print/product-labels";
import { parseSearchParams } from "@/lib/search-params";
import { labelSheetQuerySchema } from "@/lib/validation/masters";
import { requirePagePermission } from "@/server/auth/current-user";
import { listSkuLabels } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Product labels" };

export default async function LabelSheetPage({ searchParams }: PageProps<"/masters/skus/labels/print">) {
  await requirePagePermission("master.view");
  const { items } = parseSearchParams(labelSheetQuerySchema, await searchParams);
  const skus = new Map((await listSkuLabels(items.map((i) => i.skuId))).map((sku) => [sku.id, sku]));
  const labels = repeatLabels(
    items.flatMap(({ skuId, copies }) => {
      const sku = skus.get(skuId);
      return sku ? [{ label: sku, copies }] : [];
    }),
  );

  return (
    <ProductLabelSheet
      labels={labels}
      back={
        <Link href="/masters/skus/labels" className="text-sm text-brand-700 hover:underline">
          ← Choose labels
        </Link>
      }
    />
  );
}
