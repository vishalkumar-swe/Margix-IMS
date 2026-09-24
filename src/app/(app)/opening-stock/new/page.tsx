import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { OpeningBalanceForm } from "@/features/opening/opening-balance-form";
import { todayIst } from "@/lib/dates";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Post opening stock" };

export default async function NewOpeningStockPage() {
  await requirePagePermission("opening.post");
  const [godowns, skus] = await Promise.all([listGodowns({ activeOnly: true }), listSkuOptions()]);

  return (
    <>
      <PageHeader back={{ href: "/opening-stock", label: "Opening stock" }} title="Post opening stock" />
      <OpeningBalanceForm godowns={godowns.map(toNamedOption)} skus={skus.map(toSkuOption)} today={todayIst()} />
    </>
  );
}
