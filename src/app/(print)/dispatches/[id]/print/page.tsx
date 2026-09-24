import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintCell, PrintedDocument, PrintTable } from "@/features/print/printed-document";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { idSchema } from "@/lib/validation/common";
import { requirePagePermission } from "@/server/auth/current-user";
import { getCompanyDetails } from "@/server/config/company";
import { getDispatchDetail } from "@/server/modules/dispatch/dispatch.queries";

export const metadata: Metadata = { title: "Delivery challan" };

export default async function PrintDispatchPage({ params }: PageProps<"/dispatches/[id]/print">) {
  await requirePagePermission("dispatch.view");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const dispatch = await getDispatchDetail(id);
  if (!dispatch) notFound();

  return (
    <PrintedDocument
      company={getCompanyDetails()}
      title="Delivery Challan"
      number={dispatch.outwardNumber}
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
      {dispatch.remarks && <p className="mt-4 text-xs">Remarks: {dispatch.remarks}</p>}
      {dispatch.status !== "POSTED" && (
        <p className="mt-4 text-xs font-semibold text-red-700">Status: {dispatch.status.replaceAll("_", " ")}</p>
      )}
    </PrintedDocument>
  );
}
