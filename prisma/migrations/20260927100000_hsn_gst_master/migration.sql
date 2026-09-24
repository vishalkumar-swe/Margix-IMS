-- HSN/GST master: Product → Category → HSN code → GST rate.

-- CreateTable
CREATE TABLE "hsn_code" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gst_rate" DECIMAL(5,2) NOT NULL,
    "keywords" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hsn_code_pkey" PRIMARY KEY ("code")
);

ALTER TABLE "hsn_code" ADD CONSTRAINT "hsn_code_code_chk" CHECK ("code" ~ '^[0-9]{4}([0-9]{2}){0,2}$');
ALTER TABLE "hsn_code" ADD CONSTRAINT "hsn_code_gst_rate_chk" CHECK ("gst_rate" >= 0 AND "gst_rate" < 100);

-- Suggestions search description + keywords.
CREATE INDEX "hsn_code_search_idx" ON "hsn_code"
  USING GIN (to_tsvector('english', "description" || ' ' || coalesce("keywords", '')));

-- Existing product HSN codes join the master (unusable free text is cleared).
UPDATE "sku" SET "hsn_code" = NULL WHERE "hsn_code" IS NOT NULL AND trim("hsn_code") !~ '^[0-9]{4}([0-9]{2}){0,2}$';
UPDATE "sku" SET "hsn_code" = trim("hsn_code") WHERE "hsn_code" IS NOT NULL;
INSERT INTO "hsn_code" ("code", "description", "gst_rate", "updated_at")
SELECT "hsn_code", 'Imported from existing products — review description', coalesce(max("gst_rate"), 0), CURRENT_TIMESTAMP
FROM "sku" WHERE "hsn_code" IS NOT NULL GROUP BY "hsn_code";

-- AlterTable
ALTER TABLE "category" ADD COLUMN "hsn_code" TEXT;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_hsn_code_fkey" FOREIGN KEY ("hsn_code") REFERENCES "hsn_code"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sku" ADD CONSTRAINT "sku_hsn_code_fkey" FOREIGN KEY ("hsn_code") REFERENCES "hsn_code"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
