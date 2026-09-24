import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TransferForm } from "@/features/transfers/transfer-form";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "New transfer" };

export default async function NewTransferPage() {
  await requirePagePermission("transfer.create");
  const [godowns, skus] = await Promise.all([listGodowns({ activeOnly: true }), listSkuOptions()]);

  return (
    <>
      <PageHeader back={{ href: "/transfers", label: "Transfers" }} title="New transfer" />
      <TransferForm godowns={godowns.map(toNamedOption)} skus={skus.map(toSkuOption)} />
    </>
  );
}
