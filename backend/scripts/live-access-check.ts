/**
 * Runs the live report route for Franklin parcels with an empty store, and
 * prints each road access check and how long the county layers took.
 *   pnpm --filter @groundtruth/backend check:access <parcelKey>...
 */
import request from "supertest";
import { createApp } from "../src/app.js";
import { createFranklinAccessClient } from "../src/reports/franklinAccess.js";

for (const key of process.argv.slice(2)) {
  let layersMs = 0;
  const timed: typeof fetch = async (input, init) => {
    const started = performance.now();
    const res = await fetch(input, init);
    layersMs += Math.round(performance.now() - started);
    return res;
  };
  const app = createApp("live", {
    report: {
      access: createFranklinAccessClient({ fetch: timed }),
      store: { read: async () => null, write: async () => {} },
    },
  });
  const started = performance.now();
  const res = await request(app).get(
    `/api/parcels/${encodeURIComponent(key)}/report`,
  );
  const access = res.body.checks?.find(
    (c: { kind: string }) => c.kind === "access",
  );
  console.log(
    `\n${key}  HTTP ${res.status}  report ${Math.round(performance.now() - started)} ms, county layers ${layersMs} ms (summed)`,
  );
  console.log(`  ${access?.status}: ${access?.finding}`);
  console.log(`  next: ${access?.nextAction}`);
  console.log(
    `  sources: ${(access?.sources ?? []).map((s: { title: string; retrievedAt: string }) => `${s.title} @ ${s.retrievedAt}`).join(" | ")}`,
  );
}
