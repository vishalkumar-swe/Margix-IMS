-- Document pricing and GST breakdown: line discounts, other charges, and the
-- intra/inter-state decision fixed on each purchase order and invoice.

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('INTRA', 'INTER');

-- Party state (GST state code) for parties without a GSTIN.
ALTER TABLE "customer" ADD COLUMN     "state_code" TEXT;
ALTER TABLE "supplier" ADD COLUMN     "state_code" TEXT;
ALTER TABLE "customer" ADD CONSTRAINT "customer_state_code_chk" CHECK ("state_code" ~ '^[0-9]{2}$');
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_state_code_chk" CHECK ("state_code" ~ '^[0-9]{2}$');

-- AlterTable: existing documents are intra-state with no other charges.
ALTER TABLE "invoice" ADD COLUMN     "other_charges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "other_charges_label" TEXT,
ADD COLUMN     "place_of_supply" TEXT,
ADD COLUMN     "tax_type" "TaxType" NOT NULL DEFAULT 'INTRA';

ALTER TABLE "purchase_order" ADD COLUMN     "other_charges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "other_charges_label" TEXT,
ADD COLUMN     "place_of_supply" TEXT,
ADD COLUMN     "tax_type" "TaxType" NOT NULL DEFAULT 'INTRA';

ALTER TABLE "invoice" ADD CONSTRAINT "invoice_other_charges_chk" CHECK ("other_charges" >= 0);
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_place_of_supply_chk" CHECK ("place_of_supply" ~ '^[0-9]{2}$');
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_other_charges_chk" CHECK ("other_charges" >= 0);
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_place_of_supply_chk" CHECK ("place_of_supply" ~ '^[0-9]{2}$');

-- AlterTable: line discount and the HSN code as it was when the line was saved.
ALTER TABLE "invoice_item" ADD COLUMN     "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsn_code" TEXT;

ALTER TABLE "purchase_order_item" ADD COLUMN     "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsn_code" TEXT;

ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_discount_percent_chk"
  CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100);
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_discount_percent_chk"
  CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100);

-- Existing lines take their product's current HSN code.
UPDATE "invoice_item" i SET "hsn_code" = s."hsn_code" FROM "sku" s WHERE s."id" = i."sku_id";
UPDATE "purchase_order_item" i SET "hsn_code" = s."hsn_code" FROM "sku" s WHERE s."id" = i."sku_id";
