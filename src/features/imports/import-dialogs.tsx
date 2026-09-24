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
      description="Columns: code, name, unit (required); category, description, hsn_code, gst_rate, batch_tracked, tally_stock_item_name. Units and categories must already exist."
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
