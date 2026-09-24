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
import { purchaseOrderPricing } from "@/server/modules/documents/pricing";
import { getPurchaseOrderDetail } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PrintPurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]/print">) {
  await requirePagePermission("po.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const po = await getPurchaseOrderDetail(id);
  if (!po) notFound();

  const company = getCompanyDetails();
  const pricing = purchaseOrderPricing(po);

  return (
    <PrintedDocument
      company={company}
      title="Purchase Order"
      number={po.poNumber}
      qrPayload={buildDocumentQrPayload({
        type: "PO",
        number: po.poNumber,
        date: utcToDateOnly(po.orderDate),
        gstin: po.supplier.gstin,
        total: pricing.summary.grandTotal,
      })}
      back={
        <Link href={`/purchase-orders/${po.id}`} className="text-sm text-brand-700 hover:underline">
          ← Back to {po.poNumber}
        </Link>
      }
      details={[
        { label: "Order date", value: formatDate(po.orderDate) },
        { label: "Expected delivery", value: formatDate(po.expectedDate) },
        { label: "Supplier", value: `${po.supplier.name} (${po.supplier.code})` },
        { label: "Supplier GSTIN", value: po.supplier.gstin ?? "Unregistered" },
        { label: "Address", value: po.supplier.address ?? "—" },
        { label: "Supplier state", value: gstStateLabel(partyStateCode(po.supplier)) },
        { label: "Deliver to (state)", value: gstStateLabel(po.placeOfSupply) },
        { label: "Tax", value: po.taxType === "INTRA" ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)" },
        { label: "Status", value: humanize(po.status) },
        { label: "Ordered by", value: po.createdBy.name },
      ]}
      signatures={["Prepared by", "Approved by", "Supplier acceptance"]}
    >
      <PrintTaxLines view={pricing} />
      <PrintTaxSummary view={pricing} totalLabel="Order total" />
      {po.remarks && <p className="mt-4 text-xs">Terms / remarks: {po.remarks}</p>}
      {(po.status === "CANCELLED" || po.status === "DRAFT") && (
        <p className="mt-4 text-xs font-semibold text-red-700">Status: {humanize(po.status)}</p>
      )}
    </PrintedDocument>
  );
}
