import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCategories, listUoms } from "@/server/modules/masters/masters.queries";
import { previewNextCode } from "@/server/modules/numbering/numbering.service";
import { SkuStandaloneForm } from "@/features/masters/sku-standalone-form";

export const metadata: Metadata = { title: "New SKU" };

export default async function NewSkuPage() {
  await requirePagePermission("master.manage");
  const [categories, uoms, nextCode] = await Promise.all([
    listCategories({ activeOnly: true }),
    listUoms(),
    previewNextCode("SKU"),
  ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        back={{ href: "/masters/skus", label: "Products (SKUs)" }}
        title="Add new product (SKU)"
        description="Every item starts with an immutable SKU code and descriptive name."
      />
      <div className="max-w-2xl">
        <SkuStandaloneForm categories={categoryOptions} uoms={uoms} nextCode={nextCode} />
      </div>
    </>
  );
}
