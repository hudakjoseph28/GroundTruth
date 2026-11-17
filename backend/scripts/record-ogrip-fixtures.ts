/**
 * Records live OGRIP responses for the parcel route tests.
 *
 *   pnpm --filter @groundtruth/backend record:ogrip
 *
 * Each scenario calls a real API route against live OGRIP and saves every
 * upstream request URL and response body to test/fixtures/ogrip/<name>.json,
 * with the API's own response for review. Tests replay those exact URLs, so
 * a change to a query shows up as a missing recording, not as made-up data.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOgripClient, OGRIP_LOCATOR } from "../src/parcels/ogrip.js";
import {
  LOCATOR_DOWN,
  OGRIP_SCENARIOS,
  type OgripRecording,
  type OgripScenario,
} from "../test/fixtures/ogrip/scenarios.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/ogrip",
);

async function record(name: OgripScenario, path: string): Promise<void> {
  const exchanges: OgripRecording["exchanges"] = [];
  const locatorDown = LOCATOR_DOWN.has(name);
  const recordingFetch: typeof fetch = async (input, init) => {
    if (locatorDown && String(input).startsWith(OGRIP_LOCATOR)) {
      const body = { forcedOutage: "recorder answered 503 for the locator" };
      exchanges.push({
        url: String(input),
        status: 503,
        body,
        forcedFailure: true,
      });
      return new Response(JSON.stringify(body), { status: 503 });
    }
    const response = await fetch(input, init);
    const text = await response.text();
    exchanges.push({
      url: String(input),
      status: response.status,
      body: JSON.parse(text) as unknown,
    });
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    });
  };
  const recordedAt = new Date();
  const app = createApp("record", {
    ogrip: createOgripClient({
      fetch: recordingFetch,
      now: () => recordedAt,
      timeoutMs: 30_000,
      // One response per request in a recording: no hedged duplicates.
      hedgeAfterMs: 60_000,
    }),
  });

  const started = Date.now();
  const res = await request(app).get(path);
  const elapsedMs = Date.now() - started;
  const recording: OgripRecording = {
    scenario: name,
    path,
    recordedAt: recordedAt.toISOString(),
    exchanges,
    apiResponse: { status: res.status, body: res.body as unknown },
  };
  // Bodies stay compact: they are large and only ever replayed.
  const bodies = recording.exchanges.map((e) => JSON.stringify(e.body));
  const framed = JSON.stringify(
    {
      ...recording,
      exchanges: recording.exchanges.map((e, i) => ({
        ...e,
        body: `@body${i}@`,
      })),
    },
    null,
    2,
  ).replace(/"@body(\d+)@"/g, (_, i: string) => bodies[Number(i)] ?? "null");
  await writeFile(join(fixtureDir, `${name}.json`), `${framed}\n`);
  console.log(
    `${name}: ${res.status} in ${elapsedMs} ms, ${exchanges.length} OGRIP request(s)`,
  );
}

await mkdir(fixtureDir, { recursive: true });
const only = process.argv.slice(2);
for (const [name, path] of Object.entries(OGRIP_SCENARIOS)) {
  if (only.length > 0 && !only.includes(name)) continue;
  await record(name as OgripScenario, path);
}
