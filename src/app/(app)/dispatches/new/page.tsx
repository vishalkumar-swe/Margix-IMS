import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DispatchForm, type DispatchableInvoice } from "@/features/dispatch/dispatch-form";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { listOpenInvoices } from "@/server/modules/invoices/invoice.queries";
import { listCustomers, listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "New dispatch" };

export default async function NewDispatchPage({ searchParams }: PageProps<"/dispatches/new">) {
  await requirePagePermission("dispatch.create");
  const { invoiceId } = await searchParams;
  const [godowns, customers, skus, openInvoices] = await Promise.all([
    listGodowns({ activeOnly: true }),
    listCustomers({ activeOnly: true }),
    listSkuOptions(),
    listOpenInvoices(),
  ]);

  const invoices: DispatchableInvoice[] = openInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: invoice.customer.name,
    remainingBySku: Object.fromEntries(
      invoice.items
        .filter((item) => item.quantity.greaterThan(item.dispatchedQty))
        .map((item) => [item.skuId, item.quantity.minus(item.dispatchedQty).toString()]),
    ),
  }));

  return (
    <>
      <PageHeader back={{ href: "/dispatches", label: "Dispatches" }} title="New dispatch" />
      <DispatchForm
        godowns={godowns.map(toNamedOption)}
        customers={customers.map(toNamedOption)}
        skus={skus.map(toSkuOption)}
        invoices={invoices}
        initialInvoiceId={typeof invoiceId === "string" ? invoiceId : undefined}
      />
    </>
  );
}
