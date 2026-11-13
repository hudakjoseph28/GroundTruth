-- CreateTable
CREATE TABLE "ParcelRecord" (
    "key" TEXT NOT NULL,
    "sourceParcelId" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "countyFips" TEXT NOT NULL,
    "township" TEXT,
    "siteAddress" TEXT,
    "acreage" DECIMAL(12,4),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geometryGeoJson" JSONB NOT NULL,
    "geometryAuthority" TEXT NOT NULL,
    "geometrySourceUrl" TEXT NOT NULL,
    "geometryRetrievedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParcelRecord_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ReportRecord" (
    "parcelKey" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL,
    "coverage" TEXT NOT NULL,
    "biggestOpenQuestion" TEXT NOT NULL,

    CONSTRAINT "ReportRecord_pkey" PRIMARY KEY ("parcelKey")
);

-- CreateTable
CREATE TABLE "CheckRecord" (
    "id" TEXT NOT NULL,
    "reportParcelKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "limitation" TEXT NOT NULL,
    "nextAction" TEXT NOT NULL,
    "responsibleRole" TEXT NOT NULL,
    "responsibleOrganization" TEXT,
    "publicContactUrl" TEXT,
    "reviewerWallet" TEXT,
    "transactionSignature" TEXT,

    CONSTRAINT "CheckRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "authority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "effectiveDate" TIMESTAMPTZ(3),

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckRecord_reportParcelKey_kind_key" ON "CheckRecord"("reportParcelKey", "kind");

-- AddForeignKey
ALTER TABLE "ReportRecord" ADD CONSTRAINT "ReportRecord_parcelKey_fkey" FOREIGN KEY ("parcelKey") REFERENCES "ParcelRecord"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckRecord" ADD CONSTRAINT "CheckRecord_reportParcelKey_fkey" FOREIGN KEY ("reportParcelKey") REFERENCES "ReportRecord"("parcelKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "CheckRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
