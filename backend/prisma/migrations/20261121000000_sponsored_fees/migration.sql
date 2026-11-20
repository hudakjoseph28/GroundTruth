-- Fee sponsorship: one row per fee-payer signature the API issued for a
-- reviewer's sign_approval, place_hold, or release. The per-deal cap counts them.

-- CreateTable
CREATE TABLE "SponsoredFeeRecord" (
    "signature" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsoredFeeRecord_pkey" PRIMARY KEY ("signature")
);

-- CreateIndex
CREATE INDEX "SponsoredFeeRecord_dealId_idx" ON "SponsoredFeeRecord"("dealId");
