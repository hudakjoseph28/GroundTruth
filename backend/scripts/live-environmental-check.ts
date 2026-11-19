/**
 * Runs the live report route with an empty store and prints each parcel's
 * environmental check (NWI wetlands, and Franklin stream setbacks) and how
 * long it took.
 *   pnpm --filter @groundtruth/backend check:environmental <parcelKey>...
 */
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp("live", {
  report: { store: { read: async () => null, write: async () => {} } },
});
for (const key of process.argv.slice(2)) {
  const started = performance.now();
  const res = await request(app).get(
    `/api/parcels/${encodeURIComponent(key)}/report`,
  );
  const check = res.body.checks?.find(
    (c: { kind: string }) => c.kind === "environmental",
  );
  console.log(
    `\n${key}  HTTP ${res.status}  report ${Math.round(performance.now() - started)} ms`,
  );
  console.log(`  ${check?.status}: ${check?.finding}`);
  console.log(`  limitation: ${check?.limitation}`);
  console.log(
    `  sources: ${(check?.sources ?? []).map((s: { title: string; retrievedAt: string }) => `${s.title} @ ${s.retrievedAt}`).join(" | ")}`,
  );
}
