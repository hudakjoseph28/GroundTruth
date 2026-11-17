import type { Prisma, PrismaClient } from "@prisma/client";
import type { Parcel, ParcelReport } from "@groundtruth/shared";
import { toParcelReport } from "./mapReport.js";

/**
 * Reports in PostgreSQL (Architecture: "Normalized `Check` in PostgreSQL"
 * is the cached copy of what a record establishes).
 *
 * - A report with no `expiresAt` was seeded or manually verified (the
 *   staged demo, later the golden parcel). It is always served and never
 *   overwritten by a live report.
 * - A live report is stored with an `expiresAt` and served until then.
 *   Each source keeps its own `retrievedAt`, so a cached copy still says
 *   when FEMA or OGRIP was asked.
 */
export interface ReportStore {
  /** The stored report still in force at `now`, or null. */
  read(parcelKey: string, now: Date): Promise<ParcelReport | null>;
  /** Stores a live report unless a seeded report holds the key. */
  write(parcel: Parcel, report: ParcelReport, expiresAt: Date): Promise<void>;
}

export function prismaReportStore(prisma: PrismaClient): ReportStore {
  return {
    async read(parcelKey, now) {
      const row = await prisma.reportRecord.findUnique({
        where: { parcelKey },
        include: {
          checks: {
            include: { sources: true },
            orderBy: { position: "asc" },
          },
        },
      });
      if (!row) return null;
      if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
        return null;
      }
      return toParcelReport(row);
    },

    async write(parcel, report, expiresAt) {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.reportRecord.findUnique({
          where: { parcelKey: parcel.key },
          select: { expiresAt: true },
        });
        if (existing && existing.expiresAt === null) return;

        const parcelRow = {
          sourceParcelId: parcel.sourceParcelId,
          county: parcel.county,
          countyFips: parcel.countyFips,
          township: parcel.township ?? null,
          siteAddress: parcel.siteAddress ?? null,
          acreage: parcel.acreage ?? null,
          latitude: parcel.centroid.latitude,
          longitude: parcel.centroid.longitude,
          geometryGeoJson: toJson(parcel.geometry.geojson),
          geometryAuthority: parcel.geometry.authority,
          geometrySourceUrl: parcel.geometry.sourceUrl,
          geometryRetrievedAt: new Date(parcel.geometry.retrievedAt),
        };
        await tx.parcelRecord.upsert({
          where: { key: parcel.key },
          create: { key: parcel.key, ...parcelRow },
          update: parcelRow,
        });

        const reportRow = {
          generatedAt: new Date(report.generatedAt),
          coverage: report.coverage,
          biggestOpenQuestion: report.biggestOpenQuestion,
          expiresAt,
        };
        await tx.reportRecord.upsert({
          where: { parcelKey: parcel.key },
          create: { parcelKey: parcel.key, ...reportRow },
          update: reportRow,
        });

        await tx.checkRecord.deleteMany({
          where: { reportParcelKey: parcel.key },
        });
        for (const [position, check] of report.checks.entries()) {
          const id = `${parcel.key}:${check.kind}`;
          await tx.checkRecord.create({
            data: {
              id,
              reportParcelKey: parcel.key,
              position,
              kind: check.kind,
              status: check.status,
              finding: check.finding,
              limitation: check.limitation,
              nextAction: check.nextAction,
              responsibleRole: check.responsibleParty.role,
              responsibleOrganization:
                check.responsibleParty.organization ?? null,
              publicContactUrl: check.responsibleParty.publicContactUrl ?? null,
              reviewerWallet: check.reviewerWallet ?? null,
              transactionSignature: check.transactionSignature ?? null,
              sources: {
                create: check.sources.map((source, index) => ({
                  id: `${id}:${index}`,
                  position: index,
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
      });
    },
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  // GeoJSON is plain JSON; the round trip drops anything that is not.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
