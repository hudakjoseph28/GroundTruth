-- CreateTable
CREATE TABLE "LandAssetRecord" (
    "parcelKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "meta" JSONB NOT NULL,
    "imagery" BYTEA NOT NULL,
    "height" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandAssetRecord_pkey" PRIMARY KEY ("parcelKey")
);
