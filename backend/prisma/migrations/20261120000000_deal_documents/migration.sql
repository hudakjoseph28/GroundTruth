-- Deal documents: participant uploads (metadata and private bytes in separate
-- tables), single-use nonces for wallet-signed document requests, and the
-- document hash an approval transaction's Memo instruction names.

-- AlterTable
ALTER TABLE "TimelineEventRecord" ADD COLUMN     "citedDocumentSha256" TEXT;

-- CreateTable
CREATE TABLE "DealDocumentRecord" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaderRole" TEXT NOT NULL,
    "uploaderWallet" TEXT NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DealDocumentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealDocumentFileRecord" (
    "documentId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "DealDocumentFileRecord_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "DocumentAuthNonceRecord" (
    "wallet" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentAuthNonceRecord_pkey" PRIMARY KEY ("wallet","nonce")
);

-- CreateIndex
CREATE INDEX "DealDocumentRecord_dealId_uploadedAt_idx" ON "DealDocumentRecord"("dealId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealDocumentRecord_dealId_sha256_key" ON "DealDocumentRecord"("dealId", "sha256");

-- CreateIndex
CREATE INDEX "DocumentAuthNonceRecord_usedAt_idx" ON "DocumentAuthNonceRecord"("usedAt");

-- AddForeignKey
ALTER TABLE "DealDocumentRecord" ADD CONSTRAINT "DealDocumentRecord_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "DealRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDocumentFileRecord" ADD CONSTRAINT "DealDocumentFileRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DealDocumentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

