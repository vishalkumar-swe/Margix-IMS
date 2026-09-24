import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DispatchForm } from "@/features/dispatch/dispatch-form";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCustomers, listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "New dispatch" };

export default async function NewDispatchPage() {
  await requirePagePermission("dispatch.create");
  const [godowns, customers, skus] = await Promise.all([
    listGodowns({ activeOnly: true }),
    listCustomers({ activeOnly: true }),
    listSkuOptions(),
  ]);

  return (
    <>
      <PageHeader back={{ href: "/dispatches", label: "Dispatches" }} title="New dispatch" />
      <DispatchForm
        godowns={godowns.map(toNamedOption)}
        customers={customers.map(toNamedOption)}
        skus={skus.map(toSkuOption)}
      />
    </>
  );
}
