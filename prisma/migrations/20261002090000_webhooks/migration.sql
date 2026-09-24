-- Integrations: outbound webhooks (endpoints + transactional delivery outbox).
-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "webhook_endpoint" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "response_status" INTEGER,
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_delivery_status_next_attempt_at_idx" ON "webhook_delivery"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "webhook_delivery_endpoint_id_created_at_idx" ON "webhook_delivery"("endpoint_id", "created_at");

-- AddForeignKey
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_url_chk" CHECK ("url" ~ '^https?://');
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_events_chk" CHECK (cardinality("events") > 0);
