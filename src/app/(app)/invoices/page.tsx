import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { ProductFilterNotice } from "@/components/shared/product-filter-notice";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { INVOICE_STATUSES, invoiceListQuerySchema } from "@/lib/validation/invoices";
import { requirePagePermission } from "@/server/auth/current-user";
import { listInvoices } from "@/server/modules/invoices/invoice.queries";
import { getSku } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const user = await requirePagePermission("invoice.view");
  const raw = await searchParams;
  const query = parseSearchParams(invoiceListQuerySchema, raw);
  const [{ items, total }, sku] = await Promise.all([listInvoices(query), query.skuId ? getSku(query.skuId) : null]);
  const newButton = can(user.role, "invoice.manage") && (
    <Link href="/invoices/new" className={buttonVariants()}>
      <Plus aria-hidden /> New invoice
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What was sold to customers, and how much of it has been dispatched."
        actions={newButton}
      />
      <Card>
        <ProductFilterNotice sku={sku} clearHref="/invoices" />
        <FilterBar
          hidden={{ skuId: query.skuId }}
          search={{ name: "q", placeholder: "Invoice number or customer", value: query.q }}
          selects={[
            {
              name: "status",
              label: "All statuses",
              value: query.status,
              options: INVOICE_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Invoice</TH>
                  <TH>Date</TH>
                  <TH>Customer</TH>
                  <TH numeric>Lines</TH>
                  <TH numeric>Dispatches</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((invoice) => (
                  <TR key={invoice.id}>
                    <TD>
                      <Link href={`/invoices/${invoice.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                    </TD>
                    <TD className="text-xs">{formatDate(invoice.invoiceDate)}</TD>
                    <TD>{invoice.customer.name}</TD>
                    <TD numeric>{invoice._count.items}</TD>
                    <TD numeric>{invoice._count.outwards}</TD>
                    <TD>
                      <StatusBadge status={invoice.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/invoices" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={FileText} title="No invoices found" action={newButton || undefined} />
        )}
      </Card>
    </>
  );
}
