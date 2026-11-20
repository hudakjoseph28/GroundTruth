-- Document parcel checks: what the API read from an uploaded deal document
-- (parcel ID, address, document type, one key finding) and whether the
-- parcel ID is the deal's. Advisory only; one row per document.

-- CreateTable
CREATE TABLE "DealDocumentCheckRecord" (
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parcelMatch" TEXT,
    "parcelId" TEXT,
    "address" TEXT,
    "documentType" TEXT,
    "keyFinding" TEXT,
    "model" TEXT,
    "failure" TEXT,
    "checkedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DealDocumentCheckRecord_pkey" PRIMARY KEY ("documentId")
);

-- AddForeignKey
ALTER TABLE "DealDocumentCheckRecord" ADD CONSTRAINT "DealDocumentCheckRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DealDocumentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
