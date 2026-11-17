import { Prisma } from "@prisma/client";
import {
  goldenParcel,
  goldenReport,
  stagedDeal,
  type Parcel,
  type ParcelReport,
} from "@groundtruth/shared";
import { prisma } from "./db.js";
import { seedDeal } from "./deals/seedDeal.js";

/**
 * The old made-up stand-in parcel. Its report, checks, and sources cascade
 * with it. Only this exact fixture key is removed.
 */
const RETIRED_FIXTURE_KEYS = ["ohio:39049:STAGED-DEMO"];

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await seedParcelReport(tx, goldenParcel, goldenReport);
    await seedDeal(tx, stagedDeal);
    await tx.parcelRecord.deleteMany({
      where: { key: { in: RETIRED_FIXTURE_KEYS } },
    });
  });

  const checks = await prisma.checkRecord.count({
    where: { reportParcelKey: goldenReport.parcelKey },
  });
  const sources = await prisma.sourceRecord.count({
    where: { check: { reportParcelKey: goldenReport.parcelKey } },
  });
  console.log(
    `seeded ${goldenReport.parcelKey} with ${checks} checks and ${sources} sources`,
  );
  const events = await prisma.timelineEventRecord.count({
    where: { dealId: stagedDeal.id },
  });
  console.log(`seeded deal ${stagedDeal.id} (${events} timeline events)`);
}

/** Upserts a parcel and replaces its report's checks and sources. */
async function seedParcelReport(
  tx: Prisma.TransactionClient,
  parcel: Parcel,
  report: ParcelReport,
): Promise<void> {
  if (report.parcelKey !== parcel.key) {
    throw new Error("Report does not belong to the parcel");
  }
  const parcelFields = {
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
  };
  await tx.parcelRecord.upsert({
    where: { key: parcel.key },
    create: { key: parcel.key, ...parcelFields },
    update: parcelFields,
  });

  const reportFields = {
    generatedAt: new Date(report.generatedAt),
    coverage: report.coverage,
    biggestOpenQuestion: report.biggestOpenQuestion,
  };
  await tx.reportRecord.upsert({
    where: { parcelKey: report.parcelKey },
    create: { parcelKey: report.parcelKey, ...reportFields },
    update: reportFields,
  });

  // Sources cascade with their checks.
  await tx.checkRecord.deleteMany({
    where: { reportParcelKey: report.parcelKey },
  });
  for (const [position, check] of report.checks.entries()) {
    const checkId = `${report.parcelKey}:${check.kind}`;
    await tx.checkRecord.create({
      data: {
        id: checkId,
        reportParcelKey: report.parcelKey,
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
        sources: {
          create: check.sources.map((source, sourcePosition) => ({
            id: `${checkId}:${sourcePosition}`,
            position: sourcePosition,
            authority: source.authority,
            title: source.title,
            url: source.url,
            retrievedAt: new Date(source.retrievedAt),
            effectiveDate: source.effectiveDate
              ? new Date(source.effectiveDate)
              : null,
          })),
        },
      },
    });
  }
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
