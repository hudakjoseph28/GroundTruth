/**
 * Records live OGRIP and FEMA NFHL responses for the report route tests.
 *
 *   pnpm --filter @groundtruth/backend record:report                   # every scenario
 *   pnpm --filter @groundtruth/backend record:report franklin-floodway # one scenario
 *
 * Each scenario calls the real report route with a store that holds
 * nothing, and saves every upstream request (URL, POST body) and response
 * to test/fixtures/report/<name>.json, with the API's own response for
 * review. Tests replay those exact requests, so a changed query shows up as
 * a missing recording, not as made-up data.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOgripClient } from "../src/parcels/ogrip.js";
import { createFemaFloodClient } from "../src/reports/femaFlood.js";
import {
  REPORT_SCENARIOS,
  reportPath,
  type RecordedExchange,
  type ReportRecording,
  type ReportScenario,
} from "../test/fixtures/report/scenarios.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/report",
);

async function record(name: ReportScenario): Promise<void> {
  const parcelKey = REPORT_SCENARIOS[name];
  const exchanges: RecordedExchange[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const text = await response.text();
    exchanges.push({
      method: init?.method ?? "GET",
      url: String(input),
      ...(typeof init?.body === "string" && { requestBody: init.body }),
      status: response.status,
      body: JSON.parse(text) as unknown,
    });
    return new Response(text, { status: response.status });
  };
  const recordedAt = new Date();
  const app = createApp("record", {
    ogrip: createOgripClient({
      fetch: recordingFetch,
      now: () => recordedAt,
      timeoutMs: 30_000,
    }),
    report: {
      fema: createFemaFloodClient({
        fetch: recordingFetch,
        now: () => recordedAt,
      }),
      floodTimeoutMs: 30_000,
      now: () => recordedAt,
      store: { read: async () => null, write: async () => {} },
    },
  });

  const started = Date.now();
  const res = await request(app).get(reportPath(parcelKey));
  const recording: ReportRecording = {
    scenario: name,
    parcelKey,
    recordedAt: recordedAt.toISOString(),
    // Concurrent FEMA queries finish in any order; sort for stable diffs.
    exchanges: exchanges.sort((a, b) =>
      `${a.url}${a.requestBody ?? ""}`.localeCompare(
        `${b.url}${b.requestBody ?? ""}`,
      ),
    ),
    apiResponse: { status: res.status, body: res.body as unknown },
  };
  await writeFile(
    join(fixtureDir, `${name}.json`),
    `${JSON.stringify(recording, null, 2)}\n`,
  );
  const flood = (
    res.body as { checks?: { kind: string; finding: string }[] }
  ).checks?.find((check) => check.kind === "flood");
  console.log(
    `${name}: ${res.status} in ${Date.now() - started} ms, ${exchanges.length} upstream calls${flood ? ` | ${flood.finding}` : ""}`,
  );
}

const requested = process.argv.slice(2);
const names = (
  requested.length > 0 ? requested : Object.keys(REPORT_SCENARIOS)
) as ReportScenario[];
for (const name of names) {
  if (!(name in REPORT_SCENARIOS)) {
    throw new Error(`unknown scenario ${name}`);
  }
  await record(name);
}
