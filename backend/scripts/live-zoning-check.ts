/**
 * Runs the live report route for Franklin parcels with an empty store, and
 * prints each zoning check and how long the county map took.
 *   pnpm --filter @groundtruth/backend check:zoning <parcelKey>...
 */
import request from "supertest";
import { createApp } from "../src/app.js";
import { createFranklinZoningClient } from "../src/reports/franklinZoning.js";

for (const key of process.argv.slice(2)) {
  let zoningMs = 0;
  const timed: typeof fetch = async (input, init) => {
    const started = performance.now();
    const res = await fetch(input, init);
    zoningMs = Math.round(performance.now() - started);
    return res;
  };
  const app = createApp("live", {
    report: {
      zoning: createFranklinZoningClient({ fetch: timed }),
      store: { read: async () => null, write: async () => {} },
    },
  });
  const started = performance.now();
  const res = await request(app).get(
    `/api/parcels/${encodeURIComponent(key)}/report`,
  );
  const zoning = res.body.checks?.find(
    (c: { kind: string }) => c.kind === "zoning",
  );
  console.log(
    `\n${key}  HTTP ${res.status}  report ${Math.round(performance.now() - started)} ms, county map ${zoningMs} ms`,
  );
  console.log(`  ${zoning?.status}: ${zoning?.finding}`);
  console.log(
    `  sources: ${(zoning?.sources ?? []).map((s: { title: string; retrievedAt: string }) => `${s.title} @ ${s.retrievedAt}`).join(" | ")}`,
  );
}
