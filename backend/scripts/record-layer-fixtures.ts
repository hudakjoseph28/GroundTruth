/**
 * Records live OGRIP, FEMA NFHL, National Wetlands Inventory, and Franklin
 * County zoning, right-of-way, and stream-buffer responses for the map
 * layer tests (test/layers.test.ts).
 *
 *   pnpm --filter @groundtruth/backend record:layers                 # every scenario
 *   pnpm --filter @groundtruth/backend record:layers franklin-golden # one scenario
 *
 * Each scenario calls the real layers route and saves every upstream request
 * and response to test/fixtures/report/layers-<name>.json, with the API's own
 * response for review. A JSON answer over LARGE_BODY_CHARS (a watershed's
 * setback outline) goes to bodies/ under the same name the report recorder
 * gives it, so both recordings share one file.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createParcelLayers } from "../src/layers/parcelLayers.js";
import { createOgripClient } from "../src/parcels/ogrip.js";
import { createFranklinStreamBuffersClient } from "../src/reports/franklinStreamBuffers.js";
import {
  LAYER_SCENARIOS,
  layersPath,
  type LayerScenario,
  type RecordedExchange,
  type ReportRecording,
} from "../test/fixtures/report/scenarios.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/report",
);

const LARGE_BODY_CHARS = 1_000_000;

async function record(name: LayerScenario): Promise<void> {
  const parcelKey = LAYER_SCENARIOS[name];
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
  const now = () => recordedAt;
  const app = createApp("record", {
    ogrip: createOgripClient({
      fetch: recordingFetch,
      now,
      timeoutMs: 30_000,
    }),
    layers: createParcelLayers({
      fetch: recordingFetch,
      now,
      timeoutMs: 60_000,
      streamSetbacks: createFranklinStreamBuffersClient({
        fetch: recordingFetch,
        now,
      }),
    }),
  });

  const started = Date.now();
  const res = await request(app).get(layersPath(parcelKey));
  const recording: ReportRecording = {
    scenario: `layers-${name}`,
    parcelKey,
    recordedAt: recordedAt.toISOString(),
    // Concurrent queries finish in any order; sort for stable diffs.
    exchanges: exchanges.sort((a, b) =>
      `${a.url}${a.requestBody ?? ""}`.localeCompare(
        `${b.url}${b.requestBody ?? ""}`,
      ),
    ),
    apiResponse: { status: res.status, body: res.body as unknown },
  };
  await writeFile(
    join(fixtureDir, `layers-${name}.json`),
    // Compact: the outlines are long coordinate lists, which indenting
    // would quadruple.
    `${JSON.stringify(recording)}\n`,
  );
  const layers = (res.body as { layers?: { id: string; status: string }[] })
    .layers;
  console.log(
    `${name}: ${res.status} in ${Date.now() - started} ms, ${exchanges.length} upstream calls; ${(layers ?? []).map((l) => `${l.id} ${l.status}`).join(", ")}`,
  );
}

const asked = process.argv.slice(2);
const names = (
  asked.length > 0 ? asked : Object.keys(LAYER_SCENARIOS)
) as LayerScenario[];
for (const name of names) {
  if (!(name in LAYER_SCENARIOS)) throw new Error(`No layer scenario ${name}`);
  await record(name);
}
