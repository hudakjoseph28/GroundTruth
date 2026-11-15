-- CreateTable
CREATE TABLE "DealRecord" (
    "id" TEXT NOT NULL,
    "parcelKey" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "sellerWallet" TEXT NOT NULL,
    "sellerTokenAccount" TEXT NOT NULL,
    "amountBaseUnits" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "escrowAddress" TEXT,
    "publicDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DealRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewerRecord" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "approvedAt" TIMESTAMPTZ(3),
    "approvalTransaction" TEXT,

    CONSTRAINT "ReviewerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldRecord" (
    "dealId" TEXT NOT NULL,
    "placedByWallet" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "buyerMessage" TEXT NOT NULL,
    "transactionSignature" TEXT NOT NULL,
    "placedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HoldRecord_pkey" PRIMARY KEY ("dealId")
);

-- CreateTable
CREATE TABLE "TimelineEventRecord" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "type" TEXT NOT NULL,
    "actorRole" TEXT,
    "buyerMessage" TEXT NOT NULL,
    "transactionSignature" TEXT,
    "eventIndex" INTEGER,
    "slot" BIGINT,
    "confirmationStatus" TEXT NOT NULL,

    CONSTRAINT "TimelineEventRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewerRecord_dealId_wallet_role_key" ON "ReviewerRecord"("dealId", "wallet", "role");

-- CreateIndex
CREATE INDEX "TimelineEventRecord_dealId_at_idx" ON "TimelineEventRecord"("dealId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineEventRecord_transactionSignature_eventIndex_key" ON "TimelineEventRecord"("transactionSignature", "eventIndex");

-- AddForeignKey
ALTER TABLE "ReviewerRecord" ADD CONSTRAINT "ReviewerRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldRecord" ADD CONSTRAINT "HoldRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEventRecord" ADD CONSTRAINT "TimelineEventRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
