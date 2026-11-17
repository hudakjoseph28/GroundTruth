import { Prisma } from "@prisma/client";
import { stagedDeal, stagedParcel, type Parcel } from "@groundtruth/shared";
import { prisma } from "./db.js";
import { seedDeal } from "./deals/seedDeal.js";
import { stagedReport } from "./reports/stagedReport.js";

async function main(): Promise<void> {
  const parcel: Parcel = stagedParcel;
  await prisma.$transaction(async (tx) => {
    await tx.parcelRecord.upsert({
      where: { key: parcel.key },
      create: {
        key: parcel.key,
        sourceParcelId: parcel.sourceParcelId,
        county: parcel.county,
        countyFips: parcel.countyFips,
        township: parcel.township ?? null,
        siteAddress: parcel.siteAddress ?? null,
        acreage: parcel.acreage ?? null,
        latitude: parcel.centroid.latitude,
        longitude: parcel.centroid.longitude,
        geometryGeoJson: jsonValue(parcel.geometry.geojson),
        geometryAuthority: parcel.geometry.authority,
        geometrySourceUrl: parcel.geometry.sourceUrl,
        geometryRetrievedAt: new Date(parcel.geometry.retrievedAt),
      },
      update: {
        sourceParcelId: parcel.sourceParcelId,
        county: parcel.county,
        countyFips: parcel.countyFips,
        township: parcel.township ?? null,
        siteAddress: parcel.siteAddress ?? null,
        acreage: parcel.acreage ?? null,
        latitude: parcel.centroid.latitude,
        longitude: parcel.centroid.longitude,
        geometryGeoJson: jsonValue(parcel.geometry.geojson),
        geometryAuthority: parcel.geometry.authority,
        geometrySourceUrl: parcel.geometry.sourceUrl,
        geometryRetrievedAt: new Date(parcel.geometry.retrievedAt),
      },
    });

    await tx.reportRecord.upsert({
      where: { parcelKey: stagedReport.parcelKey },
      create: {
        parcelKey: stagedReport.parcelKey,
        generatedAt: new Date(stagedReport.generatedAt),
        coverage: stagedReport.coverage,
        biggestOpenQuestion: stagedReport.biggestOpenQuestion,
      },
      update: {
        generatedAt: new Date(stagedReport.generatedAt),
        coverage: stagedReport.coverage,
        biggestOpenQuestion: stagedReport.biggestOpenQuestion,
        // A seeded report never expires. Clearing it here also takes back a
        // key that a live report was cached under (src/reports/store.ts).
        expiresAt: null,
      },
    });

    await tx.checkRecord.deleteMany({
      where: { reportParcelKey: stagedReport.parcelKey },
    });

    await tx.checkRecord.createMany({
      data: stagedReport.checks.map((check, position) => ({
        id: `${stagedReport.parcelKey}:${check.kind}`,
        reportParcelKey: stagedReport.parcelKey,
        position,
        kind: check.kind,
        status: check.status,
        finding: check.finding,
        limitation: check.limitation,
        nextAction: check.nextAction,
        responsibleRole: check.responsibleParty.role,
        responsibleOrganization: check.responsibleParty.organization ?? null,
        publicContactUrl: check.responsibleParty.publicContactUrl ?? null,
        reviewerWallet: check.reviewerWallet ?? null,
        transactionSignature: check.transactionSignature ?? null,
      })),
    });

    await seedDeal(tx, stagedDeal);
  });

  const checks = await prisma.checkRecord.count({
    where: { reportParcelKey: stagedReport.parcelKey },
  });
  console.log(`seeded ${stagedReport.parcelKey} with ${checks} checks`);
  const events = await prisma.timelineEventRecord.count({
    where: { dealId: stagedDeal.id },
  });
  console.log(`seeded deal ${stagedDeal.id} (${events} timeline events)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    logSeedFailure(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });

function jsonValue(value: unknown): Prisma.InputJsonValue {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isJson(parsed)) throw new Error("Parcel geometry is not JSON");
  return parsed;
}

function isJson(value: unknown): value is Prisma.InputJsonValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJson);
  if (value !== null && typeof value === "object") {
    return Object.values(value).every(isJson);
  }
  return false;
}

function logSeedFailure(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`seed failed: ${error.code}`);
    return;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error("seed failed: database connection");
    return;
  }
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`seed failed: ${name}`);
}
