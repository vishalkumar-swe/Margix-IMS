"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ScanInput, type ScanStatus } from "@/features/scan/scan-input";
import { findByScanCode } from "@/lib/barcode";
import { cn } from "@/lib/cn";

export interface LabelProduct {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
}

const MAX_COPIES = 200;

/**
 * Choose products and the number of labels for each, then open the printable
 * sheet. Scanning a product adds one label for it.
 */
export function LabelPicker({ products }: { products: LabelProduct[] }) {
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);

  const chosen = products
    .map((p) => ({ product: p, count: Number(copies[p.id] ?? "") }))
    .filter(({ count }) => Number.isInteger(count) && count >= 1 && count <= MAX_COPIES);
  const total = chosen.reduce((sum, { count }) => sum + count, 0);
  const href = `/masters/skus/labels/print?items=${chosen.map(({ product, count }) => `${product.id}:${count}`).join(",")}`;

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? products.filter(
        (p) => p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle) || p.barcode === filter.trim(),
      )
    : products;

  function onScan(code: string) {
    const product = findByScanCode(products, code);
    if (!product) {
      setScanStatus({ tone: "error", text: `No active product has the barcode or code "${code}".` });
      return;
    }
    setCopies((current) => ({ ...current, [product.id]: String(Math.min(MAX_COPIES, Number(current[product.id] || 0) + 1)) }));
    setScanStatus({ tone: "success", text: `${product.code}: one more label.` });
  }

  return (
    <Card>
      <CardHeader
        title="Products"
        description="Enter how many labels to print for each product (3 × 8 labels per A4 sheet)."
        actions={
          <Link
            href={href}
            aria-disabled={total === 0}
            className={cn(buttonVariants(), total === 0 && "pointer-events-none opacity-50")}
          >
            <Printer aria-hidden /> Print {total} {total === 1 ? "label" : "labels"}
          </Link>
        }
      />
      <div className="grid gap-3 border-b border-slate-200 px-5 py-3 md:grid-cols-2">
        <Input aria-label="Filter products" placeholder="Filter by code or name" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ScanInput label="Scan product" onScan={onScan} status={scanStatus} />
      </div>
      <Table>
        <THead>
          <tr>
            <TH>Code</TH>
            <TH>Name</TH>
            <TH>Barcode</TH>
            <TH>Labels</TH>
          </tr>
        </THead>
        <TBody>
          {visible.map((p) => (
            <TR key={p.id}>
              <TD className="font-mono text-xs font-medium">{p.code}</TD>
              <TD>{p.name}</TD>
              <TD className="font-mono text-xs">{p.barcode ?? <span className="text-amber-700">None (code is printed)</span>}</TD>
              <TD>
                <Input
                  aria-label={`Labels for ${p.code}`}
                  inputMode="numeric"
                  placeholder="0"
                  value={copies[p.id] ?? ""}
                  onChange={(e) => setCopies({ ...copies, [p.id]: e.target.value })}
                  className="w-24"
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
