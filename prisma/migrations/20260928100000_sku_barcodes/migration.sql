-- Product barcodes: EAN-13 (internal ones start with 2) or any Code 128 value.

-- AlterTable
ALTER TABLE "sku" ADD COLUMN     "barcode" TEXT;

-- Printable ASCII without spaces, as scanners send it.
ALTER TABLE "sku" ADD CONSTRAINT "sku_barcode_chk" CHECK ("barcode" ~ '^[!-~]{1,48}$');

-- CreateIndex
CREATE UNIQUE INDEX "sku_barcode_key" ON "sku"("barcode");
