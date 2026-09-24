import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AdjustmentForm } from "@/features/adjustments/adjustment-form";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Request adjustment" };

export default async function NewAdjustmentPage({ searchParams }: PageProps<"/adjustments/new">) {
  await requirePagePermission("adjustment.request");
  const [godowns, skus] = await Promise.all([listGodowns({ activeOnly: true }), listSkuOptions()]);
  const raw = await searchParams;
  const param = (name: string) => (typeof raw[name] === "string" ? (raw[name] as string) : "");
  // "Adjust" / "Write off" from a stock row open the request pre-filled.
  const prefill =
    param("skuId") && param("godownId")
      ? {
          skuId: param("skuId"),
          godownId: param("godownId"),
          batchId: param("batchId"),
          direction: param("direction") === "increase" ? ("increase" as const) : ("decrease" as const),
          quantity: /^\d+(\.\d+)?$/.test(param("quantity")) ? param("quantity") : "",
        }
      : undefined;

  return (
    <>
      <PageHeader back={{ href: "/adjustments", label: "Adjustments" }} title="Request adjustment" />
      <AdjustmentForm godowns={godowns.map(toNamedOption)} skus={skus.map(toSkuOption)} prefill={prefill} />
    </>
  );
}
