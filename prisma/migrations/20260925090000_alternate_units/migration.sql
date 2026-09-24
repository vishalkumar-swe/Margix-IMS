-- Alternate units per SKU (e.g. BOX = 24 PCS) and the as-entered unit
-- snapshot on purchase order and invoice lines.

-- AlterTable
ALTER TABLE "invoice_item" ADD COLUMN     "entry_factor" DECIMAL(18,6),
ADD COLUMN     "entry_quantity" DECIMAL(18,3),
ADD COLUMN     "entry_uom_id" UUID;

-- AlterTable
ALTER TABLE "purchase_order_item" ADD COLUMN     "entry_factor" DECIMAL(18,6),
ADD COLUMN     "entry_quantity" DECIMAL(18,3),
ADD COLUMN     "entry_uom_id" UUID;

-- CreateTable
CREATE TABLE "sku_unit" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "uom_id" UUID NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sku_unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sku_unit_sku_id_uom_id_key" ON "sku_unit"("sku_id", "uom_id");

-- AddForeignKey
ALTER TABLE "sku_unit" ADD CONSTRAINT "sku_unit_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_unit" ADD CONSTRAINT "sku_unit_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_entry_uom_id_fkey" FOREIGN KEY ("entry_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_entry_uom_id_fkey" FOREIGN KEY ("entry_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Integrity rules (hand-written)
-- =====================================================================

ALTER TABLE "sku_unit" ADD CONSTRAINT "sku_unit_factor_chk" CHECK ("factor" > 0);

-- The entry snapshot is all-or-nothing and consistent with the stored base quantity.
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_entry_chk" CHECK (
  ("entry_uom_id" IS NULL AND "entry_quantity" IS NULL AND "entry_factor" IS NULL) OR
  ("entry_uom_id" IS NOT NULL AND "entry_quantity" > 0 AND "entry_factor" > 0
   AND "entry_quantity" * "entry_factor" = "ordered_qty"));
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_entry_chk" CHECK (
  ("entry_uom_id" IS NULL AND "entry_quantity" IS NULL AND "entry_factor" IS NULL) OR
  ("entry_uom_id" IS NOT NULL AND "entry_quantity" > 0 AND "entry_factor" > 0
   AND "entry_quantity" * "entry_factor" = "quantity"));
