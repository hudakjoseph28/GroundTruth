/**
 * Records live OGRIP responses for the parcel route tests.
 *
 *   pnpm --filter @groundtruth/backend record:ogrip
 *
 * Each scenario calls a real API route against live OGRIP and saves every
 * upstream request URL and response body to test/fixtures/ogrip/<name>.json,
 * with the API's own response for review. Tests replay those exact URLs, so
 * a change to a query shows up as a missing recording, not as made-up data.
 *
 *   pnpm --filter @groundtruth/backend record:ogrip --refresh [name...]
 *
 * `--refresh` calls nothing live. It replays each recording's saved OGRIP
 * responses through the current code and rewrites only `apiResponse`, for a
 * change in how the API shapes its answer (such as address formatting). It
 * stops if the code asks OGRIP for anything the recording does not hold:
 * that scenario needs a real recording.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  await save({
    scenario: name,
    path,
    recordedAt: recordedAt.toISOString(),
    exchanges,
    apiResponse: { status: res.status, body: res.body as unknown },
  });
  console.log(
    `${name}: ${res.status} in ${elapsedMs} ms, ${exchanges.length} OGRIP request(s)`,
  );
}

/** Re-derives `apiResponse` from a recording's own exchanges; no live calls. */
async function refresh(name: OgripScenario): Promise<void> {
  const file = join(fixtureDir, `${name}.json`);
  const text = await readFile(file, "utf8");
  const recording = JSON.parse(text) as OgripRecording;
  const byUrl = new Map(recording.exchanges.map((e) => [e.url, e]));
  const replayFetch: typeof fetch = async (input) => {
    const recorded = byUrl.get(String(input));
    if (!recorded) {
      throw new Error(
        `${name}: the code now asks OGRIP for a request this recording does not hold. Record it live instead.\n${String(input)}`,
      );
    }
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
    });
  };
  let unrecorded: unknown;
  const app = createApp("record", {
    ogrip: createOgripClient({
      fetch: async (input, init) => {
        try {
          return await replayFetch(input, init);
        } catch (error) {
          unrecorded = error;
          throw error;
        }
      },
      now: () => new Date(recording.recordedAt),
      timeoutMs: 30_000,
      hedgeAfterMs: 60_000,
    }),
  });
  const res = await request(app).get(recording.path);
  if (unrecorded) throw unrecorded;
  // An error body carries a fresh request ID each run; that is not a change.
  const comparable = (response: OgripRecording["apiResponse"]) =>
    JSON.stringify(response).replace(/"requestId":"[^"]*"/g, "");
  const before = comparable(recording.apiResponse);
  const after = { status: res.status, body: res.body as unknown };
  const changed = before !== comparable(after);
  if (changed) {
    await writeFile(file, patchApiResponse(text, recording.apiResponse, after));
  }
  console.log(
    `${name}: ${res.status}, ${changed ? "apiResponse updated" : "unchanged"}`,
  );
}

/**
 * Rewrites only the strings that changed inside the file's `apiResponse`
 * block, so the recorded exchanges above it stay byte for byte as recorded.
 * A change of shape (a key or an array length) is not patched: record live.
 */
function patchApiResponse(
  text: string,
  before: OgripRecording["apiResponse"],
  after: OgripRecording["apiResponse"],
): string {
  const start = text.lastIndexOf('"apiResponse"');
  if (start < 0) throw new Error("recording has no apiResponse block");
  const changes: [string, string][] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === "string" && typeof b === "string") {
      if (a !== b && !path.endsWith(".requestId")) changes.push([a, b]);
      return;
    }
    if (
      a !== null &&
      b !== null &&
      typeof a === "object" &&
      typeof b === "object"
    ) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (
        Array.isArray(a) !== Array.isArray(b) ||
        keysA.join() !== keysB.join()
      ) {
        throw new Error(
          `apiResponse changed shape at ${path || "the top"}: record it live`,
        );
      }
      for (const key of keysA) {
        walk(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          `${path}.${key}`,
        );
      }
      return;
    }
    if (a !== b) {
      throw new Error(
        `apiResponse changed a non-text value at ${path}: record it live`,
      );
    }
  };
  walk(before, after, "");
  let block = text.slice(start);
  let from = 0;
  for (const [was, now] of changes) {
    const at = block.indexOf(JSON.stringify(was), from);
    if (at < 0)
      throw new Error(`could not find ${JSON.stringify(was)} to update`);
    block =
      block.slice(0, at) +
      JSON.stringify(now) +
      block.slice(at + JSON.stringify(was).length);
    from = at + JSON.stringify(now).length;
  }
  return text.slice(0, start) + block;
}

async function save(recording: OgripRecording): Promise<void> {
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
  await writeFile(
    join(fixtureDir, `${recording.scenario}.json`),
    `${framed}\n`,
  );
}

await mkdir(fixtureDir, { recursive: true });
const args = process.argv.slice(2);
const refreshOnly = args.includes("--refresh");
const only = args.filter((arg) => !arg.startsWith("--"));
for (const [name, path] of Object.entries(OGRIP_SCENARIOS)) {
  if (only.length > 0 && !only.includes(name)) continue;
  if (refreshOnly) await refresh(name as OgripScenario);
  else await record(name as OgripScenario, path);
}
