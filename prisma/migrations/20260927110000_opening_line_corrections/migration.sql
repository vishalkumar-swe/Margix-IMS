-- Opening stock corrections: a corrected line links to the line it replaced.
-- AlterTable
ALTER TABLE "opening_balance_item" ADD COLUMN     "replaces_item_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "opening_balance_item_replaces_item_id_key" ON "opening_balance_item"("replaces_item_id");

-- AddForeignKey
ALTER TABLE "opening_balance_item" ADD CONSTRAINT "opening_balance_item_replaces_item_id_fkey" FOREIGN KEY ("replaces_item_id") REFERENCES "opening_balance_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

