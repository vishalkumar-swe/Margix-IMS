"use client";

import { CsvImportDialog } from "./csv-import-dialog";

/*
 * The concrete imports. They live in a client module because each result
 * summary is a function, which a server page cannot pass to a client component.
 */

export function SkuImportDialog() {
  return (
    <CsvImportDialog<{ created: number }>
      endpoint="/imports/skus"
      title="Import SKUs"
      description="Columns: name, unit (required); code (leave blank for the next SKU code), category, description, hsn_code, gst_rate, batch_tracked, tally_stock_item_name. Units and categories must already exist."
      templateHref="/templates/sku-import-template.csv"
      summarise={(r) => `${r.created} SKUs imported.`}
    />
  );
}

export function OpeningStockImportDialog({ today }: { today: string }) {
  return (
    <CsvImportDialog<{ documents: { openingNumber: string; godown: string; lines: number }[] }>
      endpoint="/imports/opening-stock"
      title="Import opening stock"
      description="Columns: godown, sku, quantity (required); batch (required for batch-tracked SKUs), manufacturing_date, expiry_date (YYYY-MM-DD). One opening document is posted per godown."
      templateHref="/templates/opening-stock-import-template.csv"
      asOf={{ label: "Balance as of", defaultValue: today }}
      summarise={(r) =>
        `Posted ${r.documents.map((d) => `${d.openingNumber} (${d.godown}, ${d.lines} lines)`).join(", ")}.`
      }
    />
  );
}

export function HsnImportDialog() {
  return (
    <CsvImportDialog<{ created: number; updated: number }>
      endpoint="/imports/hsn"
      title="Import HSN / GST codes"
      description="Columns: code, description, gst_rate (required); keywords. Existing codes are updated, new ones added. Use the official CBIC HSN/SAC schedule; rates in the template are only an example."
      templateHref="/templates/hsn-import-template.csv"
      summarise={(r) => `${r.created} codes added, ${r.updated} updated.`}
    />
  );
}
