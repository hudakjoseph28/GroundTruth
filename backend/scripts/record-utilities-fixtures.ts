/**
 * Records the water and sewer maps' live answers for replay tests.
 *
 *   pnpm --filter @groundtruth/backend record:utilities
 *
 * Runs the production adapter (src/reports/utilities.ts) on each parcel and
 * saves every HTTP exchange, keyed by request, plus the outcome and the
 * check it produces. Dodridge St and Dartmoor Rd are read live from OGRIP
 * first; the golden and Licking parcels are the shared fixtures, so the
 * replay asks for exactly the polygons the seeded reports use.
 *
 * All-or-nothing: it writes nothing unless every source answered with HTTP
 * 200 for every parcel.
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  goldenParcel,
  secondCountyParcel,
  type Check,
  type Parcel,
} from "@groundtruth/shared";
import { createOgripClient } from "../src/parcels/ogrip.js";
import {
  createUtilitiesClient,
  type UtilitiesOutcome,
} from "../src/reports/utilities.js";
import { utilitiesCheck } from "../src/reports/utilitiesCheck.js";
import { DEFAULT_UTILITIES_TIMEOUT_MS } from "../src/reports/pipeline.js";

interface Exchange {
  method: string;
  url: string;
  body: string;
  status: number;
  responseBody: unknown;
}

export interface UtilitiesRecording {
  name: string;
  parcel: Parcel;
  recordedAt: string;
  exchanges: Exchange[];
  outcome: UtilitiesOutcome;
  check: Check;
}

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/utilities",
);

const ogrip = createOgripClient({ timeoutMs: 20_000 });

async function live(countyFips: string, id: string): Promise<Parcel> {
  const parcel = await ogrip.getParcel(countyFips, id);
  if (!parcel) throw new Error(`OGRIP has no parcel ${countyFips}:${id}`);
  return parcel;
}

const targets: Array<{ name: string; parcel: () => Promise<Parcel> }> = [
  { name: "golden-230-000918", parcel: async () => goldenParcel },
  { name: "dodridge-010-042534", parcel: () => live("39049", "010-042534") },
  { name: "licking-00500729609000", parcel: async () => secondCountyParcel },
  { name: "grove-city-040-002918", parcel: () => live("39049", "040-002918") },
];

async function record(
  name: string,
  parcel: Parcel,
): Promise<UtilitiesRecording> {
  const recordedAt = new Date();
  const exchanges: Exchange[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const text = await response.text();
    let responseBody: unknown = text;
    try {
      responseBody = JSON.parse(text) as unknown;
    } catch {
      // Kept verbatim; the status check below refuses it.
    }
    exchanges.push({
      method: init?.method ?? "GET",
      url: String(input),
      body: String(init?.body ?? ""),
      status: response.status,
      responseBody,
    });
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    });
  };
  const client = createUtilitiesClient({
    fetch: recordingFetch,
    now: () => recordedAt,
    sourceTimeoutMs: 30_000,
  });
  const outcome = await client.utilities(parcel, AbortSignal.timeout(60_000));
  const failed = [
    outcome.waterSystems,
    outcome.sewersheds,
    outcome.countyAreas,
    ...outcome.mains.map((main) => main.answer),
  ].filter((answer) => answer?.status === "failed");
  const bad = exchanges.filter(
    (exchange) =>
      exchange.status !== 200 ||
      (typeof exchange.responseBody === "object" &&
        exchange.responseBody !== null &&
        "error" in exchange.responseBody),
  );
  if (failed.length > 0 || bad.length > 0) {
    throw new Error(
      `${name}: refusing to record ${failed.length} failed source(s), ${bad.length} bad response(s)`,
    );
  }
  exchanges.sort((a, b) =>
    `${a.url}\n${a.body}`.localeCompare(`${b.url}\n${b.body}`),
  );
  return {
    name,
    parcel,
    recordedAt: recordedAt.toISOString(),
    exchanges,
    outcome,
    check: utilitiesCheck(parcel, outcome, DEFAULT_UTILITIES_TIMEOUT_MS),
  };
}

await mkdir(fixtureDir, { recursive: true });
const recordings: UtilitiesRecording[] = [];
for (const target of targets) {
  const parcel = await target.parcel();
  const recording = await record(target.name, parcel);
  recordings.push(recording);
  console.log(`${target.name}: ${recording.check.status}`);
  console.log(`  ${recording.check.finding}`);
  console.log(`  next: ${recording.check.nextAction}`);
}
for (const recording of recordings) {
  const file = join(fixtureDir, `${recording.name}.json`);
  const temp = `${file}.tmp`;
  await rm(temp, { force: true });
  await writeFile(temp, `${JSON.stringify(recording, null, 2)}\n`);
  await rename(temp, file);
}
console.log(`wrote ${recordings.length} recordings to ${fixtureDir}`);
