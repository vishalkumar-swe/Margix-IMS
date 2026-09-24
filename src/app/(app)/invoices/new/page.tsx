import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceForm } from "@/features/invoices/invoice-form";
import { todayIst } from "@/lib/dates";
import { toPartyOption, toSkuOption } from "@/lib/options";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { listCustomers, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  await requirePagePermission("invoice.manage");
  const [customers, skus] = await Promise.all([listCustomers({ activeOnly: true }), listSkuOptions()]);

  return (
    <>
      <PageHeader back={{ href: "/invoices", label: "Invoices" }} title="New invoice" />
      <InvoiceForm
        customers={customers.map(toPartyOption)}
        skus={skus.map(toSkuOption)}
        today={todayIst()}
        companyStateCode={getCompanyDetails().stateCode ?? null}
      />
    </>
  );
}
