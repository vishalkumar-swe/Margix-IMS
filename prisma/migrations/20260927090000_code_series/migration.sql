-- Numbering master: admin-customised code series (defaults live in src/lib/numbering.ts).
-- CreateTable
CREATE TABLE "code_series" (
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "padding" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID NOT NULL,

    CONSTRAINT "code_series_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "code_series" ADD CONSTRAINT "code_series_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "code_series" ADD CONSTRAINT "code_series_padding_chk" CHECK ("padding" BETWEEN 3 AND 10);
ALTER TABLE "code_series" ADD CONSTRAINT "code_series_pattern_chk" CHECK (position('{SEQ}' in "pattern") > 0);
