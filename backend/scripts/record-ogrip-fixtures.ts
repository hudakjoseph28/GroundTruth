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
import { createOgripClient } from "../src/parcels/ogrip.js";
import {
  OGRIP_SCENARIOS,
  type OgripRecording,
} from "../test/fixtures/ogrip/scenarios.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/ogrip",
);

async function record(name: string, path: string): Promise<void> {
  const exchanges: OgripRecording["exchanges"] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
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
  await writeFile(
    join(fixtureDir, `${name}.json`),
    `${JSON.stringify(recording, null, 2)}\n`,
  );
  console.log(
    `${name}: ${res.status} in ${elapsedMs} ms, ${exchanges.length} OGRIP request(s)`,
  );
}

await mkdir(fixtureDir, { recursive: true });
for (const [name, path] of Object.entries(OGRIP_SCENARIOS)) {
  await record(name, path);
}
