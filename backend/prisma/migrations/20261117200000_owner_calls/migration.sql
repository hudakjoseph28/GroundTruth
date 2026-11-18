-- CreateTable
CREATE TABLE "OwnerCallRecord" (
    "conversationId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "participantLabel" TEXT NOT NULL,
    "callSuccessful" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerCallRecord_pkey" PRIMARY KEY ("conversationId")
);

-- CreateIndex
CREATE INDEX "OwnerCallRecord_dealId_idx" ON "OwnerCallRecord"("dealId");

-- AddForeignKey
ALTER TABLE "OwnerCallRecord" ADD CONSTRAINT "OwnerCallRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

