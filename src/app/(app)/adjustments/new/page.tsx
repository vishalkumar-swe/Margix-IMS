import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AdjustmentForm } from "@/features/adjustments/adjustment-form";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Request adjustment" };

export default async function NewAdjustmentPage() {
  await requirePagePermission("adjustment.request");
  const [godowns, skus] = await Promise.all([listGodowns({ activeOnly: true }), listSkuOptions()]);

  return (
    <>
      <PageHeader back={{ href: "/adjustments", label: "Adjustments" }} title="Request adjustment" />
      <AdjustmentForm godowns={godowns.map(toNamedOption)} skus={skus.map(toSkuOption)} />
    </>
  );
}
