-- Phase 2 enum additions. Kept in their own migration because PostgreSQL does
-- not allow a new enum value to be used in the transaction that adds it.
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'SHORT_CLOSED';
ALTER TYPE "TallyEntityType" ADD VALUE 'TRANSFER';
ALTER TYPE "TallyEntityType" ADD VALUE 'SALES_RETURN';
ALTER TYPE "TallyEntityType" ADD VALUE 'PURCHASE_RETURN';
