import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  goldenParcel,
  goldenReport,
  secondCountyReport,
  type Parcel,
  type ParcelReport,
} from "@groundtruth/shared";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { prismaReportStore } from "../../src/reports/store.js";
import type { ReportRecording } from "../fixtures/report/scenarios.js";

const recording = JSON.parse(
  readFileSync(
    new URL("../fixtures/report/franklin-outside.json", import.meta.url),
    "utf8",
  ),
) as ReportRecording;
const recorded = recording.apiResponse.body as ParcelReport;

const run = randomUUID().slice(0, 8);
const key = (label: string) => `ohio:39049:dbtest-${run}-${label}`;

function parcelFor(parcelKey: string): Parcel {
  return {
    key: parcelKey,
    sourceParcelId: parcelKey.split(":")[2] ?? "",
    county: "Franklin",
    countyFips: "39049",
    siteAddress: "84 W DODRIDGE ST",
    centroid: { latitude: 40.01657, longitude: -83.01438 },
    geometry: {
      geojson: {
        type: "Polygon",
        coordinates: [
          [
            [-83.0142782, 40.0164132],
            [-83.014393, 40.0163945],
            [-83.0144793, 40.0167287],
            [-83.0142782, 40.0164132],
          ],
        ],
      },
      authority: "Ohio OGRIP",
      sourceUrl: "https://example.invalid/recorded-in-fixture",
      retrievedAt: recording.recordedAt,
    },
  };
}

const store = prismaReportStore(prisma);
const used: string[] = [];

afterAll(async () => {
  await prisma.parcelRecord.deleteMany({ where: { key: { in: used } } });
  await prisma.$disconnect();
});

describe("report store against PostgreSQL", () => {
  it("round-trips a live report, sources and effective dates included", async () => {
    const parcelKey = key("live");
    used.push(parcelKey);
    const report = { ...recorded, parcelKey };
    const at = new Date(recording.recordedAt);

    await store.write(
      parcelFor(parcelKey),
      report,
      new Date(at.getTime() + 60_000),
    );

    expect(await store.read(parcelKey, at)).toEqual(report);
    // Expired: the route rebuilds it.
    expect(
      await store.read(parcelKey, new Date(at.getTime() + 60_000)),
    ).toBeNull();
  });

  it("replaces a live copy on the next write", async () => {
    const parcelKey = key("rewrite");
    used.push(parcelKey);
    const at = new Date(recording.recordedAt);
    const later = new Date(at.getTime() + 1_000);
    await store.write(parcelFor(parcelKey), { ...recorded, parcelKey }, later);

    const second: ParcelReport = {
      ...recorded,
      parcelKey,
      generatedAt: later.toISOString(),
      checks: recorded.checks.slice(0, 2),
    };
    await store.write(
      parcelFor(parcelKey),
      second,
      new Date(at.getTime() + 60_000),
    );

    expect(await store.read(parcelKey, later)).toEqual(second);
  });

  it("never overwrites a seeded report", async () => {
    const parcelKey = key("seeded");
    used.push(parcelKey);
    const parcel = parcelFor(parcelKey);
    await prisma.parcelRecord.create({
      data: {
        key: parcelKey,
        sourceParcelId: parcel.sourceParcelId,
        county: parcel.county,
        countyFips: parcel.countyFips,
        latitude: parcel.centroid.latitude,
        longitude: parcel.centroid.longitude,
        geometryGeoJson: parcel.geometry.geojson as object,
        geometryAuthority: parcel.geometry.authority,
        geometrySourceUrl: parcel.geometry.sourceUrl,
        geometryRetrievedAt: new Date(parcel.geometry.retrievedAt),
        report: {
          create: {
            generatedAt: new Date("2026-11-12T00:00:00.000Z"),
            coverage: "boundaryOnly",
            biggestOpenQuestion: "access",
          },
        },
      },
    });

    await store.write(
      parcel,
      { ...recorded, parcelKey },
      new Date("2030-01-01T00:00:00.000Z"),
    );

    expect(
      await store.read(parcelKey, new Date("2040-01-01T00:00:00.000Z")),
    ).toEqual({
      parcelKey,
      generatedAt: "2026-11-12T00:00:00.000Z",
      coverage: "boundaryOnly",
      biggestOpenQuestion: "access",
      checks: [],
    });
  });

  it("serves the seeded reports unchanged, even over a live copy cached first", async () => {
    // A live report cached under the golden key before the seed ran. The
    // seed restores the golden rows below.
    await prisma.parcelRecord.deleteMany({ where: { key: goldenParcel.key } });
    const live = { ...recorded, parcelKey: goldenParcel.key };
    await store.write(goldenParcel, live, new Date("2026-11-18T00:00:00.000Z"));
    expect(
      await store.read(goldenParcel.key, new Date("2026-11-17T12:00:00.000Z")),
    ).toEqual(live);

    // The real seed script, as `db:seed` runs it.
    // Node itself, not `npx`: Windows cannot spawn `npx` without a shell.
    execFileSync(process.execPath, ["--import", "tsx", "src/seed.ts"], {
      env: process.env,
      stdio: "ignore",
    });
    const farFuture = new Date("2040-01-01T00:00:00.000Z");
    expect(await store.read(goldenParcel.key, farFuture)).toEqual(goldenReport);
    // Seeded unknown checks are written from templateCheck(); what the API
    // serves is still the shared fixture, field for field.
    expect(await store.read(secondCountyReport.parcelKey, farFuture)).toEqual(
      secondCountyReport,
    );

    // A later live write cannot replace it.
    await store.write(
      goldenParcel,
      { ...recorded, parcelKey: goldenParcel.key },
      new Date("2040-01-02T00:00:00.000Z"),
    );
    expect(await store.read(goldenParcel.key, farFuture)).toEqual(goldenReport);
    const row = await prisma.reportRecord.findUnique({
      where: { parcelKey: goldenParcel.key },
      select: { expiresAt: true },
    });
    expect(row?.expiresAt).toBeNull();
  }, 60_000);
});
