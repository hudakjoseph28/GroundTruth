/**
 * Records live OGRIP, FEMA NFHL, National Wetlands Inventory, and Franklin
 * County zoning, right-of-way, road, and stream-buffer responses for the
 * report route tests.
 *
 *   pnpm --filter @groundtruth/backend record:report                   # every scenario
 *   pnpm --filter @groundtruth/backend record:report franklin-floodway # one scenario
 *
 * Each scenario calls the real report route with a store that holds
 * nothing, and saves every upstream request (URL, POST body) and response
 * to test/fixtures/report/<name>.json, with the API's own response for
 * review. Tests replay those exact requests, so a changed query shows up as
 * a missing recording, not as made-up data. NWI's drawing of a lot is saved
 * as base64 PNG. A JSON answer over LARGE_BODY_CHARS (a watershed's setback
 * outline) is saved compact in bodies/, named by its request, and shared by
 * every scenario that made that request.
 *
 *   pnpm --filter @groundtruth/backend record:report nfhl-ohio-studies
 *
 * records FEMA's list of Ohio NFHL studies, which backs
 * OHIO_COUNTIES_WITHOUT_NFHL and the `flood` entry in /api/coverage.
 *
 *   pnpm --filter @groundtruth/backend record:report nwi-ohio-status
 *
 * records NWI's mapping status across Ohio, which backs the `environmental`
 * entry in /api/coverage.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOgripClient } from "../src/parcels/ogrip.js";
import {
  createFemaFloodClient,
  NFHL_OHIO_STUDIES_QUERY,
} from "../src/reports/femaFlood.js";
import { createFranklinAccessClient } from "../src/reports/franklinAccess.js";
import { createFranklinStreamBuffersClient } from "../src/reports/franklinStreamBuffers.js";
import { createFranklinZoningClient } from "../src/reports/franklinZoning.js";
import {
  createNwiWetlandsClient,
  NWI_OHIO_STATUS_QUERY,
} from "../src/reports/nwiWetlands.js";
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

const LARGE_BODY_CHARS = 1_000_000;

async function record(name: ReportScenario): Promise<void> {
  const parcelKey = REPORT_SCENARIOS[name];
  const exchanges: RecordedExchange[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const exchange: RecordedExchange = {
      method: init?.method ?? "GET",
      url: String(input),
      ...(typeof init?.body === "string" && { requestBody: init.body }),
      status: response.status,
    };
    if (contentType.startsWith("image/")) {
      exchange.contentType = contentType;
      exchange.bodyBase64 = bytes.toString("base64");
    } else {
      const text = bytes.toString("utf8");
      const body = JSON.parse(text) as unknown;
      if (text.length > LARGE_BODY_CHARS) {
        const id = createHash("sha256")
          .update(
            `${exchange.method} ${exchange.url}\n${exchange.requestBody ?? ""}`,
          )
          .digest("hex")
          .slice(0, 16);
        exchange.bodyFile = `bodies/${id}.json`;
        await mkdir(join(fixtureDir, "bodies"), { recursive: true });
        await writeFile(
          join(fixtureDir, exchange.bodyFile),
          JSON.stringify(body),
        );
      } else {
        exchange.body = body;
      }
    }
    exchanges.push(exchange);
    return new Response(bytes, {
      status: response.status,
      ...(contentType && { headers: { "content-type": contentType } }),
    });
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
      zoning: createFranklinZoningClient({
        fetch: recordingFetch,
        now: () => recordedAt,
      }),
      zoningTimeoutMs: 30_000,
      access: createFranklinAccessClient({
        fetch: recordingFetch,
        now: () => recordedAt,
      }),
      accessTimeoutMs: 30_000,
      wetlands: createNwiWetlandsClient({
        fetch: recordingFetch,
        now: () => recordedAt,
      }),
      wetlandsTimeoutMs: 60_000,
      streamBuffers: createFranklinStreamBuffersClient({
        fetch: recordingFetch,
        now: () => recordedAt,
      }),
      streamBuffersTimeoutMs: 60_000,
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
  const checks = (res.body as { checks?: { kind: string; finding: string }[] })
    .checks;
  const finding = (kind: string) =>
    checks?.find((check) => check.kind === kind)?.finding;
  console.log(
    `${name}: ${res.status} in ${Date.now() - started} ms, ${exchanges.length} upstream calls`,
  );
  for (const kind of ["flood", "zoning", "environmental", "access"]) {
    if (finding(kind)) console.log(`  ${kind}: ${finding(kind)}`);
  }
}

const NFHL_STUDIES = "nfhl-ohio-studies";

async function recordNfhlStudies(): Promise<void> {
  const response = await fetch(NFHL_OHIO_STUDIES_QUERY, {
    headers: { accept: "application/json" },
  });
  const body = (await response.json()) as unknown;
  await writeFile(
    join(fixtureDir, `${NFHL_STUDIES}.json`),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        url: NFHL_OHIO_STUDIES_QUERY,
        status: response.status,
        body,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${NFHL_STUDIES}: ${response.status}`);
}

const NWI_STATUS = "nwi-ohio-status";

async function recordNwiStatus(): Promise<void> {
  const response = await fetch(NWI_OHIO_STATUS_QUERY, {
    headers: { accept: "application/json" },
  });
  const body = (await response.json()) as unknown;
  await writeFile(
    join(fixtureDir, `${NWI_STATUS}.json`),
    `${JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        url: NWI_OHIO_STATUS_QUERY,
        status: response.status,
        body,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${NWI_STATUS}: ${response.status}`);
}

const requested = process.argv.slice(2);
if (requested.length === 0 || requested.includes(NFHL_STUDIES)) {
  await recordNfhlStudies();
}
if (requested.length === 0 || requested.includes(NWI_STATUS)) {
  await recordNwiStatus();
}
const names = (
  requested.length > 0 ? requested : Object.keys(REPORT_SCENARIOS)
) as ReportScenario[];
for (const name of names) {
  if ((name as string) === NFHL_STUDIES || (name as string) === NWI_STATUS) {
    continue;
  }
  if (!(name in REPORT_SCENARIOS)) {
    throw new Error(`unknown scenario ${name}`);
  }
  await record(name);
}
