/**
 * Records the two reviewed parcels' live USDA SDA responses for replay tests.
 *
 *   pnpm --filter @groundtruth/backend record:ssurgo
 *
 * This recorder is intentionally all-or-nothing: it writes nothing unless
 * both parcel queries return HTTP 200 responses that the production adapter
 * parses as rated SSURGO map units. Only then does it replace the synthetic
 * response-shape fixture.
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
  SDA_POST_REST,
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
  request: Omit<Exchange, "status" | "responseBody">;
  response: {
    status: number;
    body: unknown;
  };
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
  let exchange: Exchange | undefined;
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const text = await response.text();
    let responseBody: unknown = text;
    try {
      responseBody = JSON.parse(text) as unknown;
    } catch {
      // Keep non-JSON outage bodies verbatim for the error below.
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    exchange = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: String(init?.body ?? ""),
      status: response.status,
      responseBody,
    };
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    });
  };
  const client = createSsurgoSoilsClient({
    fetch: recordingFetch,
    now: () => recordedAt,
  });
  const outcome = await client.septicSuitability(
    parcel.geometry.geojson,
    AbortSignal.timeout(30_000),
  );
  const captured = exchange;
  if (!captured) {
    throw new Error(`${parcel.key}: SDA request did not produce a response`);
  }
  if (
    captured.url !== SDA_POST_REST ||
    captured.status !== 200 ||
    outcome.outcome !== "found"
  ) {
    throw new Error(
      `${parcel.key}: refusing to record status ${captured.status}, outcome ${outcome.outcome}`,
    );
  }
  return {
    parcelKey: parcel.key,
    sourceParcelId: parcel.sourceParcelId,
    recordedAt: recordedAt.toISOString(),
    request: {
      url: captured.url,
      method: captured.method,
      headers: captured.headers,
      body: captured.body,
    },
    response: {
      status: captured.status,
      body: captured.responseBody,
    },
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
await rm(join(fixtureDir, "septic-map-units.json"));

for (const { file, recording } of recordings) {
  console.log(
    `${file}: ${recording.outcome.mapUnits.length} rated map unit(s), retrieved ${recording.recordedAt}`,
  );
}
