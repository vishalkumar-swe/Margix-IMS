import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintCell, PrintedDocument, PrintTable } from "@/features/print/printed-document";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { getGrnDetail } from "@/server/modules/purchasing/purchasing.queries";

export const metadata: Metadata = { title: "Goods receipt note" };

export default async function PrintGrnPage({ params }: PageProps<"/grns/[id]/print">) {
  await requirePagePermission("grn.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const grn = await getGrnDetail(id);
  if (!grn) notFound();

  return (
    <PrintedDocument
      company={getCompanyDetails()}
      title="Goods Receipt Note"
      number={grn.grnNumber}
      back={
        <Link href={`/grns/${grn.id}`} className="text-sm text-brand-700 hover:underline">
          ← Back to {grn.grnNumber}
        </Link>
      }
      details={[
        { label: "Received", value: formatDateTime(grn.receivedAt) },
        { label: "Purchase order", value: grn.purchaseOrder.poNumber },
        { label: "Supplier", value: `${grn.purchaseOrder.supplier.name} (${grn.purchaseOrder.supplier.code})` },
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
      {grn.remarks && <p className="mt-4 text-xs">Remarks: {grn.remarks}</p>}
      {grn.status !== "POSTED" && (
        <p className="mt-4 text-xs font-semibold text-red-700">Status: {grn.status.replaceAll("_", " ")}</p>
      )}
    </PrintedDocument>
  );
}
