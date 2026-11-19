/**
 * Records the two reviewed parcels' live SSURGO responses for replay tests.
 *
 *   pnpm --filter @groundtruth/backend record:ssurgo
 *
 * Runs the production adapter: USDA Soil Data Access first, then the Esri
 * Living Atlas SSURGO copy if SDA fails. Every HTTP exchange is saved in
 * order, so tests replay the exact path taken (including an SDA outage).
 *
 * All-or-nothing: it writes nothing unless both parcels end in rated SSURGO
 * map units from a real HTTP 200 response.
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  goldenParcel,
  secondCountyParcel,
  type Parcel,
} from "@groundtruth/shared";
import {
  createSsurgoSoilsClient,
  type SoilsOutcome,
} from "../src/reports/ssurgoSoils.js";

interface Exchange {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  status: number;
  responseBody: unknown;
}

interface SdaRecording {
  parcelKey: Parcel["key"];
  sourceParcelId: string;
  recordedAt: string;
  exchanges: Exchange[];
  outcome: Extract<SoilsOutcome, { outcome: "found" }>;
}

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/ssurgo",
);

const targets = [
  { parcel: goldenParcel, file: "franklin-230-000918.json" },
  { parcel: secondCountyParcel, file: "licking-00500729609000.json" },
] as const;

async function record(parcel: Parcel): Promise<SdaRecording> {
  const recordedAt = new Date();
  const exchanges: Exchange[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      exchanges.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: String(init?.body ?? ""),
        status: 0,
        responseBody: `network error: ${String(error)}`,
      });
      throw error;
    }
    const text = await response.text();
    let responseBody: unknown = text;
    try {
      responseBody = JSON.parse(text) as unknown;
    } catch {
      // Keep non-JSON outage bodies verbatim for the error below.
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    exchanges.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: String(init?.body ?? ""),
      status: response.status,
      responseBody,
    });
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    });
  };
  const client = createSsurgoSoilsClient({
    fetch: recordingFetch,
    now: () => recordedAt,
    sdaBudgetMs: 15_000,
  });
  const outcome = await client.septicSuitability(
    parcel.geometry.geojson,
    AbortSignal.timeout(30_000),
  );
  const last = exchanges.at(-1);
  if (!last || last.status !== 200 || outcome.outcome !== "found") {
    throw new Error(
      `${parcel.key}: refusing to record status ${last?.status ?? "none"}, outcome ${outcome.outcome}`,
    );
  }
  return {
    parcelKey: parcel.key,
    sourceParcelId: parcel.sourceParcelId,
    recordedAt: recordedAt.toISOString(),
    exchanges,
    outcome,
  };
}

await mkdir(fixtureDir, { recursive: true });
const recordings: Array<{
  file: (typeof targets)[number]["file"];
  recording: SdaRecording;
}> = [];
for (const target of targets) {
  console.log(`Querying ${target.parcel.key}...`);
  recordings.push({
    file: target.file,
    recording: await record(target.parcel),
  });
}

for (const { file, recording } of recordings) {
  await writeFile(
    join(fixtureDir, `${file}.tmp`),
    `${JSON.stringify(recording, null, 2)}\n`,
  );
}
for (const { file } of recordings) {
  await rename(join(fixtureDir, `${file}.tmp`), join(fixtureDir, file));
}
await rm(join(fixtureDir, "septic-map-units.json"), { force: true });

for (const { file, recording } of recordings) {
  console.log(
    `${file}: ${recording.outcome.source}, retrieved ${recording.recordedAt}`,
  );
  for (const unit of recording.outcome.mapUnits) {
    console.log(
      `  ${unit.mukey} ${unit.symbol} ${unit.name}: ${unit.rating}, ${(unit.share * 100).toFixed(2)}%`,
    );
  }
}
