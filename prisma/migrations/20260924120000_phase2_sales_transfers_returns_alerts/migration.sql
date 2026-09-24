-- Phase 2: invoices, transfers, returns, reorder alerts, PO short-close.
-- The invoice, invoice_item, reorder_rule and stock_alert tables were created in
-- the init migration but never written by Phase 1, so the column rebuilds below
-- run on empty tables.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PARTIALLY_DISPATCHED', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- (Enum values are added by the preceding phase2_enum_values migration.)

-- AlterTable
ALTER TABLE "grn_item" ADD COLUMN     "returned_qty" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "cancelled_by_id" UUID,
ADD COLUMN     "created_by_id" UUID NOT NULL,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "invoice_item" ADD COLUMN     "gst_rate" DECIMAL(5,2),
ADD COLUMN     "line_no" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "outward_item" ADD COLUMN     "returned_qty" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "close_reason" TEXT,
ADD COLUMN     "closed_at" TIMESTAMPTZ(3),
ADD COLUMN     "closed_by_id" UUID;

-- AlterTable
ALTER TABLE "reorder_rule" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL;

-- AlterTable
ALTER TABLE "stock_alert" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "StockAlertStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "transfer" (
    "id" UUID NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "from_godown_id" UUID NOT NULL,
    "to_godown_id" UUID NOT NULL,
    "transferred_at" TIMESTAMPTZ(3) NOT NULL,
    "remarks" TEXT,
    "status" "PostedDocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_item" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "out_entry_id" UUID NOT NULL,
    "in_entry_id" UUID NOT NULL,

    CONSTRAINT "transfer_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return" (
    "id" UUID NOT NULL,
    "return_number" TEXT NOT NULL,
    "outward_id" UUID NOT NULL,
    "customer_id" UUID,
    "godown_id" UUID NOT NULL,
    "returned_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "PostedDocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_item" (
    "id" UUID NOT NULL,
    "sales_return_id" UUID NOT NULL,
    "outward_item_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "ledger_entry_id" UUID NOT NULL,

    CONSTRAINT "sales_return_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return" (
    "id" UUID NOT NULL,
    "return_number" TEXT NOT NULL,
    "grn_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "godown_id" UUID NOT NULL,
    "returned_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "PostedDocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_item" (
    "id" UUID NOT NULL,
    "purchase_return_id" UUID NOT NULL,
    "grn_item_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "ledger_entry_id" UUID NOT NULL,

    CONSTRAINT "purchase_return_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfer_transfer_number_key" ON "transfer"("transfer_number");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_idempotency_key_key" ON "transfer"("idempotency_key");

-- CreateIndex
CREATE INDEX "transfer_created_at_idx" ON "transfer"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_item_out_entry_id_key" ON "transfer_item"("out_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_item_in_entry_id_key" ON "transfer_item"("in_entry_id");

-- CreateIndex
CREATE INDEX "transfer_item_transfer_id_idx" ON "transfer_item"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_return_number_key" ON "sales_return"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_idempotency_key_key" ON "sales_return"("idempotency_key");

-- CreateIndex
CREATE INDEX "sales_return_outward_id_idx" ON "sales_return"("outward_id");

-- CreateIndex
CREATE INDEX "sales_return_created_at_idx" ON "sales_return"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_item_ledger_entry_id_key" ON "sales_return_item"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "sales_return_item_sales_return_id_idx" ON "sales_return_item"("sales_return_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_return_number_key" ON "purchase_return"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_idempotency_key_key" ON "purchase_return"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_return_grn_id_idx" ON "purchase_return"("grn_id");

-- CreateIndex
CREATE INDEX "purchase_return_created_at_idx" ON "purchase_return"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_item_ledger_entry_id_key" ON "purchase_return_item"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "purchase_return_item_purchase_return_id_idx" ON "purchase_return_item"("purchase_return_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_idempotency_key_key" ON "invoice"("idempotency_key");

-- CreateIndex
CREATE INDEX "invoice_status_idx" ON "invoice"("status");

-- CreateIndex
CREATE INDEX "invoice_customer_id_idx" ON "invoice"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_item_invoice_id_sku_id_key" ON "invoice_item"("invoice_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_item_invoice_id_line_no_key" ON "invoice_item"("invoice_id", "line_no");

-- CreateIndex
CREATE INDEX "outward_invoice_id_idx" ON "outward"("invoice_id");

-- CreateIndex
CREATE INDEX "outward_item_invoice_item_id_idx" ON "outward_item"("invoice_item_id");

-- CreateIndex
CREATE INDEX "stock_alert_status_created_at_idx" ON "stock_alert"("status", "created_at");

-- CreateIndex
CREATE INDEX "stock_alert_sku_id_godown_id_status_idx" ON "stock_alert"("sku_id", "godown_id", "status");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_invoice_item_id_fkey" FOREIGN KEY ("invoice_item_id") REFERENCES "invoice_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_from_godown_id_fkey" FOREIGN KEY ("from_godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_to_godown_id_fkey" FOREIGN KEY ("to_godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_item" ADD CONSTRAINT "transfer_item_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_item" ADD CONSTRAINT "transfer_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_item" ADD CONSTRAINT "transfer_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_item" ADD CONSTRAINT "transfer_item_out_entry_id_fkey" FOREIGN KEY ("out_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_item" ADD CONSTRAINT "transfer_item_in_entry_id_fkey" FOREIGN KEY ("in_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_outward_id_fkey" FOREIGN KEY ("outward_id") REFERENCES "outward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_item" ADD CONSTRAINT "sales_return_item_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_item" ADD CONSTRAINT "sales_return_item_outward_item_id_fkey" FOREIGN KEY ("outward_item_id") REFERENCES "outward_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_item" ADD CONSTRAINT "sales_return_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_item" ADD CONSTRAINT "sales_return_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_item" ADD CONSTRAINT "sales_return_item_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item" ADD CONSTRAINT "purchase_return_item_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item" ADD CONSTRAINT "purchase_return_item_grn_item_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "grn_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item" ADD CONSTRAINT "purchase_return_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item" ADD CONSTRAINT "purchase_return_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_item" ADD CONSTRAINT "purchase_return_item_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================
-- Integrity rules (hand-written; see docs/architecture.md)
-- =====================================================================

ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_qty_chk"
  CHECK ("quantity" > 0 AND "dispatched_qty" >= 0 AND "dispatched_qty" <= "quantity");
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_cancel_chk"
  CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));

ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_returned_chk"
  CHECK ("returned_qty" >= 0 AND "returned_qty" <= "quantity");
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_returned_chk"
  CHECK ("returned_qty" >= 0 AND "returned_qty" <= "accepted_qty");

ALTER TABLE "transfer" ADD CONSTRAINT "transfer_distinct_godowns_chk" CHECK ("from_godown_id" <> "to_godown_id");
ALTER TABLE "transfer_item" ADD CONSTRAINT "transfer_item_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "sales_return_item" ADD CONSTRAINT "sales_return_item_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "purchase_return_item" ADD CONSTRAINT "purchase_return_item_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_reason_chk" CHECK (length(btrim("reason")) > 0);
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_reason_chk" CHECK (length(btrim("reason")) > 0);

ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_close_chk"
  CHECK (("status" = 'SHORT_CLOSED') = ("closed_at" IS NOT NULL));

ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_level_chk" CHECK ("reorder_level" >= 0);

-- Duplicate low-stock notifications are impossible: one active alert per SKU × godown.
CREATE UNIQUE INDEX "stock_alert_one_active_per_sku_godown"
  ON "stock_alert" ("sku_id", "godown_id", "alert_type")
  WHERE "status" = 'ACTIVE';
