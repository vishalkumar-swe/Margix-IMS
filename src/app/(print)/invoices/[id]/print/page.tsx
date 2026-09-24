import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintTaxLines, PrintTaxSummary } from "@/features/print/print-tax-breakdown";
import { PrintedDocument } from "@/features/print/printed-document";
import { formatDate, utcToDateOnly } from "@/lib/dates";
import { buildDocumentQrPayload } from "@/lib/document-codes";
import { humanize } from "@/lib/format";
import { gstStateLabel, partyStateCode } from "@/lib/gst-states";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { invoicePricing } from "@/server/modules/documents/pricing";
import { getInvoiceDetail } from "@/server/modules/invoices/invoice.queries";

export const metadata: Metadata = { title: "Tax invoice" };

export default async function PrintInvoicePage({ params }: PageProps<"/invoices/[id]/print">) {
  await requirePagePermission("invoice.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();

  const company = getCompanyDetails();
  const pricing = invoicePricing(invoice);
  const dispatches = invoice.outwards.map((o) => o.outwardNumber);

  return (
    <PrintedDocument
      company={company}
      title="Tax Invoice"
      number={invoice.invoiceNumber}
      qrPayload={buildDocumentQrPayload({
        type: "INV",
        number: invoice.invoiceNumber,
        date: utcToDateOnly(invoice.invoiceDate),
        gstin: invoice.customer.gstin,
        total: pricing.summary.grandTotal,
      })}
      back={
        <Link href={`/invoices/${invoice.id}`} className="text-sm text-brand-700 hover:underline">
          ← Back to {invoice.invoiceNumber}
        </Link>
      }
      details={[
        { label: "Invoice date", value: formatDate(invoice.invoiceDate) },
        { label: "Status", value: humanize(invoice.status) },
        { label: "Bill to", value: `${invoice.customer.name} (${invoice.customer.code})` },
        { label: "Customer GSTIN", value: invoice.customer.gstin ?? "Unregistered" },
        { label: "Address", value: invoice.customer.address ?? "—" },
        { label: "Customer state", value: gstStateLabel(partyStateCode(invoice.customer)) },
        { label: "Place of supply", value: gstStateLabel(invoice.placeOfSupply) },
        { label: "Tax", value: invoice.taxType === "INTRA" ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)" },
        { label: "Dispatches", value: dispatches.length ? dispatches.join(", ") : "Not dispatched yet" },
      ]}
      signatures={["Prepared by", "Checked by", `For ${company.name} (authorised signatory)`]}
    >
      <PrintTaxLines view={pricing} />
      <PrintTaxSummary view={pricing} totalLabel="Invoice total" />
      <div className="mt-4 grid grid-cols-2 gap-8 text-xs break-inside-avoid">
        <div>
          <p className="text-slate-500">Payment details</p>
          <p className="mt-1 whitespace-pre-line">{company.bankDetails ?? "—"}</p>
        </div>
        {invoice.remarks && (
          <div>
            <p className="text-slate-500">Remarks</p>
            <p className="mt-1">{invoice.remarks}</p>
          </div>
        )}
      </div>
      {invoice.status === "CANCELLED" && (
        <p className="mt-4 text-xs font-semibold text-red-700">
          CANCELLED on {formatDate(invoice.cancelledAt)}: {invoice.cancelReason}
        </p>
      )}
    </PrintedDocument>
  );
}
