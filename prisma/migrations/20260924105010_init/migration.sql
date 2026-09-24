-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'STORE_MANAGER', 'WAREHOUSE_OPERATOR', 'ACCOUNTS', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'INWARD', 'OUTWARD', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN_IN', 'RETURN_OUT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "ReferenceType" AS ENUM ('OPENING_BALANCE', 'GRN', 'DISPATCH', 'ADJUSTMENT', 'TRANSFER', 'SALES_RETURN', 'PURCHASE_RETURN');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('DAMAGE', 'THEFT', 'EXPIRY', 'COUNTING_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostedDocStatus" AS ENUM ('POSTED', 'PARTIALLY_REVERSED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SkuStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TallySyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "TallyEntityType" AS ENUM ('OPENING_BALANCE', 'GRN', 'DISPATCH', 'ADJUSTMENT', 'REVERSAL');

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "base_uom_id" UUID NOT NULL,
    "hsn_code" TEXT,
    "gst_rate" DECIMAL(5,2),
    "is_batch_tracked" BOOLEAN NOT NULL DEFAULT true,
    "status" "SkuStatus" NOT NULL DEFAULT 'ACTIVE',
    "tally_stock_item_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "manufacturing_date" DATE,
    "expiry_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "godown" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tally_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tally_godown_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "godown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL,
    "expected_date" DATE,
    "remarks" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_item" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "sku_id" UUID NOT NULL,
    "ordered_qty" DECIMAL(18,3) NOT NULL,
    "received_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,2),
    "gst_rate" DECIMAL(5,2),

    CONSTRAINT "purchase_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn" (
    "id" UUID NOT NULL,
    "grn_number" TEXT NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "godown_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "supplier_invoice_no" TEXT,
    "remarks" TEXT,
    "status" "PostedDocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_item" (
    "id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "purchase_order_item_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "received_qty" DECIMAL(18,3) NOT NULL,
    "accepted_qty" DECIMAL(18,3) NOT NULL,
    "rejected_qty" DECIMAL(18,3) NOT NULL,
    "rejection_reason" TEXT,
    "ledger_entry_id" UUID,

    CONSTRAINT "grn_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outward" (
    "id" UUID NOT NULL,
    "outward_number" TEXT NOT NULL,
    "godown_id" UUID NOT NULL,
    "customer_id" UUID,
    "invoice_id" UUID,
    "dispatched_at" TIMESTAMPTZ(3) NOT NULL,
    "vehicle_no" TEXT,
    "reference_no" TEXT,
    "remarks" TEXT,
    "status" "PostedDocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outward_item" (
    "id" UUID NOT NULL,
    "outward_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "invoice_item_id" UUID,
    "ledger_entry_id" UUID NOT NULL,

    CONSTRAINT "outward_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance" (
    "id" UUID NOT NULL,
    "opening_number" TEXT NOT NULL,
    "godown_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "remarks" TEXT,
    "status" "PostedDocStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance_item" (
    "id" UUID NOT NULL,
    "opening_balance_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "ledger_entry_id" UUID NOT NULL,

    CONSTRAINT "opening_balance_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustment" (
    "id" UUID NOT NULL,
    "adjustment_number" TEXT NOT NULL,
    "godown_id" UUID NOT NULL,
    "reason_code" "AdjustmentReason" NOT NULL,
    "reason_note" TEXT,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_by_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustment_item" (
    "id" UUID NOT NULL,
    "adjustment_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "ledger_entry_id" UUID,

    CONSTRAINT "adjustment_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_ledger" (
    "id" UUID NOT NULL,
    "entry_no" BIGSERIAL NOT NULL,
    "sku_id" UUID NOT NULL,
    "godown_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "balance_after" DECIMAL(18,3) NOT NULL,
    "reference_type" "ReferenceType" NOT NULL,
    "reference_id" UUID NOT NULL,
    "reference_no" TEXT NOT NULL,
    "reference_line_id" UUID,
    "reason_code" "AdjustmentReason",
    "remarks" TEXT,
    "reverses_entry_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "sku_id" UUID NOT NULL,
    "godown_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("sku_id","godown_id","batch_id")
);

-- CreateTable
CREATE TABLE "document_sequence" (
    "key" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "document_sequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "tally_sync_job" (
    "id" UUID NOT NULL,
    "entity_type" "TallyEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_no" TEXT NOT NULL,
    "status" "TallySyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "tally_voucher_id" TEXT,
    "synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tally_sync_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_sync_log" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "TallySyncStatus" NOT NULL,
    "error" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tally_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "invoice_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_item" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "dispatched_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,2),

    CONSTRAINT "invoice_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_rule" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "godown_id" UUID NOT NULL,
    "reorder_level" DECIMAL(18,3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reorder_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alert" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "godown_id" UUID NOT NULL,
    "alert_type" TEXT NOT NULL DEFAULT 'LOW_STOCK',
    "current_qty" DECIMAL(18,3) NOT NULL,
    "threshold_qty" DECIMAL(18,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "stock_alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "category_name_key" ON "category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uom_code_key" ON "uom"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sku_code_key" ON "sku"("code");

-- CreateIndex
CREATE INDEX "sku_status_idx" ON "sku"("status");

-- CreateIndex
CREATE INDEX "batch_expiry_date_idx" ON "batch"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "batch_sku_id_batch_number_key" ON "batch"("sku_id", "batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "batch_id_sku_id_key" ON "batch"("id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "godown_code_key" ON "godown"("code");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_code_key" ON "supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key" ON "customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_po_number_key" ON "purchase_order"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_idempotency_key_key" ON "purchase_order"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_order_status_idx" ON "purchase_order"("status");

-- CreateIndex
CREATE INDEX "purchase_order_supplier_id_idx" ON "purchase_order"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_item_purchase_order_id_sku_id_key" ON "purchase_order_item"("purchase_order_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_item_purchase_order_id_line_no_key" ON "purchase_order_item"("purchase_order_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "grn_grn_number_key" ON "grn"("grn_number");

-- CreateIndex
CREATE UNIQUE INDEX "grn_idempotency_key_key" ON "grn"("idempotency_key");

-- CreateIndex
CREATE INDEX "grn_purchase_order_id_idx" ON "grn"("purchase_order_id");

-- CreateIndex
CREATE INDEX "grn_created_at_idx" ON "grn"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "grn_item_ledger_entry_id_key" ON "grn_item"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "grn_item_grn_id_idx" ON "grn_item"("grn_id");

-- CreateIndex
CREATE UNIQUE INDEX "outward_outward_number_key" ON "outward"("outward_number");

-- CreateIndex
CREATE UNIQUE INDEX "outward_idempotency_key_key" ON "outward"("idempotency_key");

-- CreateIndex
CREATE INDEX "outward_created_at_idx" ON "outward"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outward_item_ledger_entry_id_key" ON "outward_item"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "outward_item_outward_id_idx" ON "outward_item"("outward_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_opening_number_key" ON "opening_balance"("opening_number");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_idempotency_key_key" ON "opening_balance"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_item_ledger_entry_id_key" ON "opening_balance_item"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "opening_balance_item_opening_balance_id_idx" ON "opening_balance_item"("opening_balance_id");

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_adjustment_number_key" ON "adjustment"("adjustment_number");

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_idempotency_key_key" ON "adjustment"("idempotency_key");

-- CreateIndex
CREATE INDEX "adjustment_status_created_at_idx" ON "adjustment"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "adjustment_item_ledger_entry_id_key" ON "adjustment_item"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "adjustment_item_adjustment_id_idx" ON "adjustment_item"("adjustment_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_entry_no_key" ON "inventory_ledger"("entry_no");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_reverses_entry_id_key" ON "inventory_ledger"("reverses_entry_id");

-- CreateIndex
CREATE INDEX "inventory_ledger_sku_id_godown_id_batch_id_created_at_idx" ON "inventory_ledger"("sku_id", "godown_id", "batch_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_ledger_godown_id_created_at_idx" ON "inventory_ledger"("godown_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_ledger_batch_id_idx" ON "inventory_ledger"("batch_id");

-- CreateIndex
CREATE INDEX "inventory_ledger_movement_type_created_at_idx" ON "inventory_ledger"("movement_type", "created_at");

-- CreateIndex
CREATE INDEX "inventory_ledger_reference_type_reference_id_idx" ON "inventory_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "inventory_ledger_created_at_idx" ON "inventory_ledger"("created_at");

-- CreateIndex
CREATE INDEX "stock_balance_godown_id_idx" ON "stock_balance"("godown_id");

-- CreateIndex
CREATE INDEX "stock_balance_batch_id_idx" ON "stock_balance"("batch_id");

-- CreateIndex
CREATE INDEX "tally_sync_job_status_next_attempt_at_idx" ON "tally_sync_job"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "tally_sync_job_entity_type_entity_id_key" ON "tally_sync_job"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "tally_sync_log_job_id_idx" ON "tally_sync_log"("job_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_invoice_number_key" ON "invoice"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "reorder_rule_sku_id_godown_id_key" ON "reorder_rule"("sku_id", "godown_id");

-- CreateIndex
CREATE INDEX "stock_alert_sku_id_godown_id_status_idx" ON "stock_alert"("sku_id", "godown_id", "status");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku" ADD CONSTRAINT "sku_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku" ADD CONSTRAINT "sku_base_uom_id_fkey" FOREIGN KEY ("base_uom_id") REFERENCES "uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch" ADD CONSTRAINT "batch_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn" ADD CONSTRAINT "grn_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn" ADD CONSTRAINT "grn_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn" ADD CONSTRAINT "grn_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward" ADD CONSTRAINT "outward_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_outward_id_fkey" FOREIGN KEY ("outward_id") REFERENCES "outward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance" ADD CONSTRAINT "opening_balance_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_item" ADD CONSTRAINT "opening_balance_item_opening_balance_id_fkey" FOREIGN KEY ("opening_balance_id") REFERENCES "opening_balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_item" ADD CONSTRAINT "opening_balance_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_item" ADD CONSTRAINT "opening_balance_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_item" ADD CONSTRAINT "opening_balance_item_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment_item" ADD CONSTRAINT "adjustment_item_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "adjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment_item" ADD CONSTRAINT "adjustment_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment_item" ADD CONSTRAINT "adjustment_item_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjustment_item" ADD CONSTRAINT "adjustment_item_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "inventory_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_batch_id_sku_id_fkey" FOREIGN KEY ("batch_id", "sku_id") REFERENCES "batch"("id", "sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tally_sync_log" ADD CONSTRAINT "tally_sync_log_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "tally_sync_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_rule" ADD CONSTRAINT "reorder_rule_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alert" ADD CONSTRAINT "stock_alert_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alert" ADD CONSTRAINT "stock_alert_godown_id_fkey" FOREIGN KEY ("godown_id") REFERENCES "godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Integrity rules Prisma cannot model (spec §8, §16.5).
-- Hand-written; keep in sync with docs/architecture.md.
-- =====================================================================

-- Ledger: quantity sign must match the movement direction.
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_sign_chk" CHECK (
  ("movement_type" IN ('OPENING', 'INWARD', 'TRANSFER_IN', 'RETURN_IN') AND "quantity" > 0) OR
  ("movement_type" IN ('OUTWARD', 'TRANSFER_OUT', 'RETURN_OUT') AND "quantity" < 0) OR
  ("movement_type" IN ('ADJUSTMENT', 'REVERSAL') AND "quantity" <> 0)
);
-- Ledger: a REVERSAL always points at the entry it reverses, and only reversals do.
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_reversal_link_chk"
  CHECK (("movement_type" = 'REVERSAL') = ("reverses_entry_id" IS NOT NULL));
-- Ledger: adjustments carry a reason code.
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_adjustment_reason_chk"
  CHECK ("movement_type" <> 'ADJUSTMENT' OR "reason_code" IS NOT NULL);
-- Negative inventory is never permitted.
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_balance_after_chk" CHECK ("balance_after" >= 0);
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_non_negative_chk" CHECK ("quantity" >= 0);

-- Document line quantities.
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_qty_chk"
  CHECK ("ordered_qty" > 0 AND "received_qty" >= 0 AND "received_qty" <= "ordered_qty");
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_qty_chk"
  CHECK ("received_qty" > 0 AND "accepted_qty" >= 0 AND "rejected_qty" >= 0
         AND "received_qty" = "accepted_qty" + "rejected_qty");
ALTER TABLE "grn_item" ADD CONSTRAINT "grn_item_ledger_link_chk"
  CHECK (("accepted_qty" > 0) = ("ledger_entry_id" IS NOT NULL));
ALTER TABLE "outward_item" ADD CONSTRAINT "outward_item_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "opening_balance_item" ADD CONSTRAINT "opening_balance_item_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "adjustment_item" ADD CONSTRAINT "adjustment_item_qty_chk" CHECK ("quantity" <> 0);

-- Adjustments: maker/checker separation and mandatory note for OTHER.
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_maker_checker_chk"
  CHECK ("reviewed_by_id" IS NULL OR "reviewed_by_id" <> "submitted_by_id");
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_other_note_chk"
  CHECK ("reason_code" <> 'OTHER' OR length(btrim(coalesce("reason_note", ''))) > 0);
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_review_chk"
  CHECK (("status" = 'SUBMITTED') = ("reviewed_by_id" IS NULL));

ALTER TABLE "uom" ADD CONSTRAINT "uom_decimal_places_chk" CHECK ("decimal_places" BETWEEN 0 AND 3);

-- Append-only tables: posted ledger entries and audit records can never be
-- edited or deleted (corrections use REVERSAL entries).
CREATE FUNCTION margix_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER "inventory_ledger_append_only"
  BEFORE UPDATE OR DELETE ON "inventory_ledger"
  FOR EACH ROW EXECUTE FUNCTION margix_forbid_mutation();

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION margix_forbid_mutation();

-- A reversal must exactly mirror its original and cannot target a reversal.
CREATE FUNCTION margix_validate_reversal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  original "inventory_ledger"%ROWTYPE;
BEGIN
  IF NEW."movement_type" = 'REVERSAL' THEN
    SELECT * INTO original FROM "inventory_ledger" WHERE "id" = NEW."reverses_entry_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reversal target % not found', NEW."reverses_entry_id" USING ERRCODE = '23503';
    END IF;
    IF original."movement_type" = 'REVERSAL' THEN
      RAISE EXCEPTION 'a reversal cannot be reversed' USING ERRCODE = '23514';
    END IF;
    IF NEW."quantity" <> -original."quantity"
       OR NEW."sku_id" <> original."sku_id"
       OR NEW."godown_id" <> original."godown_id"
       OR NEW."batch_id" <> original."batch_id" THEN
      RAISE EXCEPTION 'reversal must mirror the original entry' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "inventory_ledger_validate_reversal"
  BEFORE INSERT ON "inventory_ledger"
  FOR EACH ROW EXECUTE FUNCTION margix_validate_reversal();

-- Health check: rows where the stock_balance projection disagrees with the ledger.
-- Must always be empty.
CREATE VIEW "v_stock_balance_drift" AS
SELECT
  COALESCE(l."sku_id", b."sku_id")       AS "sku_id",
  COALESCE(l."godown_id", b."godown_id") AS "godown_id",
  COALESCE(l."batch_id", b."batch_id")   AS "batch_id",
  COALESCE(l."qty", 0)                   AS "ledger_qty",
  COALESCE(b."quantity", 0)              AS "balance_qty"
FROM (
  SELECT "sku_id", "godown_id", "batch_id", SUM("quantity") AS "qty"
  FROM "inventory_ledger"
  GROUP BY 1, 2, 3
) l
FULL JOIN "stock_balance" b USING ("sku_id", "godown_id", "batch_id")
WHERE COALESCE(l."qty", 0) <> COALESCE(b."quantity", 0);
