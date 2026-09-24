import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintTaxLines, PrintTaxSummary } from "@/features/print/print-tax-breakdown";
import { PrintCell, PrintedDocument, PrintTable } from "@/features/print/printed-document";
import { formatDate, formatDateTime, istDateOf } from "@/lib/dates";
import { buildDocumentQrPayload } from "@/lib/document-codes";
import { formatQuantity } from "@/lib/format";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { grnPricing } from "@/server/modules/documents/pricing";
import { getGrnDetail } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Goods receipt note" };

export default async function PrintGrnPage({ params }: PageProps<"/grns/[id]/print">) {
  await requirePagePermission("grn.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const grn = await getGrnDetail(id);
  if (!grn) notFound();
  const pricing = grnPricing(grn);
  const supplier = grn.purchaseOrder.supplier;

  return (
    <PrintedDocument
      company={getCompanyDetails()}
      title="Goods Receipt Note"
      number={grn.grnNumber}
      qrPayload={buildDocumentQrPayload({
        type: "GRN",
        number: grn.grnNumber,
        date: istDateOf(grn.receivedAt),
        gstin: supplier.gstin,
        total: pricing.priced ? pricing.summary.grandTotal : null,
      })}
      back={
        <Link href={`/grns/${grn.id}`} className="text-sm text-brand-700 hover:underline">
          ← Back to {grn.grnNumber}
        </Link>
      }
      details={[
        { label: "Received", value: formatDateTime(grn.receivedAt) },
        { label: "Purchase order", value: grn.purchaseOrder.poNumber },
        { label: "Supplier", value: `${supplier.name} (${supplier.code})` },
        { label: "Supplier GSTIN", value: supplier.gstin ?? "Unregistered" },
        { label: "Supplier invoice", value: grn.supplierInvoiceNo ?? "—" },
        { label: "Received into", value: `${grn.godown.name} (${grn.godown.code})` },
        { label: "Recorded by", value: grn.createdBy.name },
      ]}
      signatures={["Received by", "Checked by (QC)", "Store in-charge"]}
    >
      <PrintTable
        headers={[
          { label: "#" },
          { label: "Item" },
          { label: "Batch" },
          { label: "Expiry" },
          { label: "Received", numeric: true },
          { label: "Accepted", numeric: true },
          { label: "Rejected", numeric: true },
          { label: "Unit" },
          { label: "Rejection reason" },
        ]}
      >
        {grn.items.map((item, index) => (
          <tr key={item.id}>
            <PrintCell>{index + 1}</PrintCell>
            <PrintCell>
              {item.sku.code} · {item.sku.name}
            </PrintCell>
            <PrintCell>{item.batch.batchNumber}</PrintCell>
            <PrintCell>{formatDate(item.batch.expiryDate)}</PrintCell>
            <PrintCell numeric>{formatQuantity(item.receivedQty)}</PrintCell>
            <PrintCell numeric>{formatQuantity(item.acceptedQty)}</PrintCell>
            <PrintCell numeric>{formatQuantity(item.rejectedQty)}</PrintCell>
            <PrintCell>{item.sku.baseUom.code}</PrintCell>
            <PrintCell>{item.rejectionReason ?? ""}</PrintCell>
          </tr>
        ))}
      </PrintTable>
      {pricing.priced && (
        <section className="mt-6 break-inside-avoid">
          <p className="mb-2 text-xs font-semibold">Value of accepted goods (at purchase order prices)</p>
          <PrintTaxLines view={pricing} />
          <PrintTaxSummary view={pricing} totalLabel="Value" />
        </section>
      )}
      {grn.remarks && <p className="mt-4 text-xs">Remarks: {grn.remarks}</p>}
      {grn.status !== "POSTED" && (
        <p className="mt-4 text-xs font-semibold text-red-700">Status: {grn.status.replaceAll("_", " ")}</p>
      )}
    </PrintedDocument>
  );
}
