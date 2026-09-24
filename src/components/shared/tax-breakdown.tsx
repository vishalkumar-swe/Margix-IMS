import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatAmount, formatQuantity } from "@/lib/format";
import { gstStateLabel } from "@/lib/gst-states";
import type { PricedDocumentView } from "@/lib/tax";
import { TaxTotals } from "./tax-totals";

/**
 * Pricing card of a purchase order or invoice: per-line value and GST
 * (CGST + SGST or IGST) and the document summary.
 */
export function TaxBreakdown({ view, placeOfSupplyLabel = "Place of supply" }: { view: PricedDocumentView; placeOfSupplyLabel?: string }) {
  const intra = view.taxType === "INTRA";
  return (
    <Card>
      <CardHeader
        title="Pricing & GST"
        description={`${intra ? "Intra-state: CGST + SGST" : "Inter-state: IGST"} · ${placeOfSupplyLabel} ${gstStateLabel(view.placeOfSupply)}`}
      />
      <Table>
        <THead>
          <tr>
            <TH>#</TH>
            <TH>Product</TH>
            <TH>HSN</TH>
            <TH numeric>Qty</TH>
            <TH numeric>Rate (₹)</TH>
            <TH numeric>Disc %</TH>
            <TH numeric>Taxable (₹)</TH>
            <TH numeric>GST %</TH>
            {intra ? (
              <>
                <TH numeric>CGST (₹)</TH>
                <TH numeric>SGST (₹)</TH>
              </>
            ) : (
              <TH numeric>IGST (₹)</TH>
            )}
            <TH numeric>Amount (₹)</TH>
          </tr>
        </THead>
        <TBody>
          {view.lines.map((line) => (
            <TR key={line.key}>
              <TD className="text-xs text-slate-500">{line.lineNo}</TD>
              <TD>
                <span className="font-medium text-slate-900">{line.skuName}</span>
                <span className="block font-mono text-xs text-slate-500">{line.skuCode}</span>
              </TD>
              <TD className="font-mono text-xs">{line.hsnCode ?? "—"}</TD>
              <TD numeric>
                {formatQuantity(line.quantity)} <span className="text-xs text-slate-500">{line.unit}</span>
              </TD>
              <TD numeric>{line.rate ? formatAmount(line.rate) : "—"}</TD>
              <TD numeric>{formatQuantity(line.discountPercent)}</TD>
              <TD numeric>{formatAmount(line.tax.taxable)}</TD>
              <TD numeric>{line.tax.gstRate}</TD>
              {intra ? (
                <>
                  <TD numeric>{formatAmount(line.tax.cgst)}</TD>
                  <TD numeric>{formatAmount(line.tax.sgst)}</TD>
                </>
              ) : (
                <TD numeric>{formatAmount(line.tax.igst)}</TD>
              )}
              <TD numeric className="font-medium text-slate-900">
                {formatAmount(line.tax.total)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <CardBody className="flex justify-end border-t border-slate-200">
        <TaxTotals summary={view.summary} otherChargesLabel={view.otherChargesLabel} className="w-full max-w-sm" />
      </CardBody>
    </Card>
  );
}
