-- Staged-demo deal text alerts: private per-deal opt-ins and one alert row
-- per (confirmed timeline event, subscriber) for replay-safe delivery.

-- CreateTable
CREATE TABLE "SmsSubscriptionRecord" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "consentedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SmsSubscriptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsAlertRecord" (
    "eventId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "SmsAlertRecord_pkey" PRIMARY KEY ("eventId","subscriptionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsSubscriptionRecord_dealId_phoneNumber_key" ON "SmsSubscriptionRecord"("dealId", "phoneNumber");

-- AddForeignKey
ALTER TABLE "SmsSubscriptionRecord" ADD CONSTRAINT "SmsSubscriptionRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsAlertRecord" ADD CONSTRAINT "SmsAlertRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TimelineEventRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsAlertRecord" ADD CONSTRAINT "SmsAlertRecord_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "SmsSubscriptionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

