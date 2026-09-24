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
import { getDispatchDetail } from "@/server/modules/dispatch/dispatch.queries";
import { dispatchPricing } from "@/server/modules/documents/pricing";

export const metadata: Metadata = { title: "Delivery challan" };

export default async function PrintDispatchPage({ params }: PageProps<"/dispatches/[id]/print">) {
  await requirePagePermission("dispatch.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const dispatch = await getDispatchDetail(id);
  if (!dispatch) notFound();
  const pricing = dispatchPricing(dispatch);

  return (
    <PrintedDocument
      company={getCompanyDetails()}
      title="Delivery Challan"
      number={dispatch.outwardNumber}
      qrPayload={buildDocumentQrPayload({
        type: "DSP",
        number: dispatch.outwardNumber,
        date: istDateOf(dispatch.dispatchedAt),
        gstin: dispatch.customer?.gstin,
        total: pricing?.priced ? pricing.summary.grandTotal : null,
      })}
      back={
        <Link href={`/dispatches/${dispatch.id}`} className="text-sm text-brand-700 hover:underline">
          ← Back to {dispatch.outwardNumber}
        </Link>
      }
      details={[
        { label: "Dispatched", value: formatDateTime(dispatch.dispatchedAt) },
        { label: "From", value: `${dispatch.godown.name} (${dispatch.godown.code})` },
        {
          label: "Customer",
          value: dispatch.customer ? `${dispatch.customer.name} (${dispatch.customer.code})` : "Internal issue",
        },
        { label: "Customer GSTIN", value: dispatch.customer ? (dispatch.customer.gstin ?? "Unregistered") : "—" },
        { label: "Invoice", value: dispatch.invoice?.invoiceNumber ?? "—" },
        { label: "Reference", value: dispatch.referenceNo ?? "—" },
        { label: "Vehicle no.", value: dispatch.vehicleNo ?? "—" },
      ]}
      signatures={["Prepared by", "Checked by", "Received by (customer)"]}
    >
      <PrintTable
        headers={[
          { label: "#" },
          { label: "Item" },
          { label: "Batch" },
          { label: "Expiry" },
          { label: "Quantity", numeric: true },
          { label: "Unit" },
        ]}
      >
        {dispatch.items.map((item, index) => (
          <tr key={item.id}>
            <PrintCell>{index + 1}</PrintCell>
            <PrintCell>
              {item.sku.code} · {item.sku.name}
            </PrintCell>
            <PrintCell>{item.batch.batchNumber}</PrintCell>
            <PrintCell>{formatDate(item.batch.expiryDate)}</PrintCell>
            <PrintCell numeric>{formatQuantity(item.quantity)}</PrintCell>
            <PrintCell>{item.sku.baseUom.code}</PrintCell>
          </tr>
        ))}
      </PrintTable>
      {pricing?.priced && (
        <section className="mt-6 break-inside-avoid">
          <p className="mb-2 text-xs font-semibold">Value of goods (at {dispatch.invoice?.invoiceNumber} prices)</p>
          <PrintTaxLines view={pricing} />
          <PrintTaxSummary view={pricing} totalLabel="Value" />
        </section>
      )}
      {dispatch.remarks && <p className="mt-4 text-xs">Remarks: {dispatch.remarks}</p>}
      {dispatch.status !== "POSTED" && (
        <p className="mt-4 text-xs font-semibold text-red-700">Status: {dispatch.status.replaceAll("_", " ")}</p>
      )}
    </PrintedDocument>
  );
}
