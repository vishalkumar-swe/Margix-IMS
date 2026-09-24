import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductLabelSheet, repeatLabels } from "@/features/print/product-labels";
import { parseSearchParams } from "@/lib/search-params";
import { idSchema } from "@/lib/validation/common";
import { skuLabelQuerySchema } from "@/lib/validation/masters";
import { requirePagePermission } from "@/server/auth/current-user";
import { listSkuLabels } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Product label" };

export default async function SkuLabelPage({ params, searchParams }: PageProps<"/masters/skus/[id]/label">) {
  await requirePagePermission("master.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { copies } = parseSearchParams(skuLabelQuerySchema, await searchParams);
  const [sku] = await listSkuLabels([id]);
  if (!sku) notFound();

  return (
    <ProductLabelSheet
      labels={repeatLabels([{ label: sku, copies }])}
      back={
        <Link href="/masters/skus" className="text-sm text-brand-700 hover:underline">
          ← Back to products
        </Link>
      }
    />
  );
}
