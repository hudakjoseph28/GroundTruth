/**
 * Runs the live layers route and prints each map layer: status, what is in
 * view, the measured shares of the lot, and how long it took.
 *   pnpm --filter @groundtruth/backend check:layers <parcelKey>...
 */
import type { MapLayer } from "@groundtruth/shared";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp("live");
for (const key of process.argv.slice(2)) {
  const started = performance.now();
  const res = await request(app).get(
    `/api/parcels/${encodeURIComponent(key)}/layers`,
  );
  console.log(
    `\n${key}  HTTP ${res.status}  ${Math.round(performance.now() - started)} ms  ${JSON.stringify(res.body).length} bytes`,
  );
  for (const layer of (res.body.layers ?? []) as MapLayer[]) {
    const vertices = layer.shapes.reduce(
      (n, shape) => n + shape.rings.reduce((m, ring) => m + ring.length, 0),
      0,
    );
    console.log(
      `  ${layer.id}: ${layer.status}; ${layer.shapes.length} shapes, ${vertices} vertices${layer.image ? `, image ${layer.image.length} chars` : ""}`,
    );
    if (layer.inView.length)
      console.log(`    in view: ${layer.inView.join(" | ")}`);
    if (layer.onLot?.length)
      console.log(
        `    on lot: ${layer.onLot.map((s) => `${s.name} ${(s.share * 100).toFixed(3)}%`).join(" | ")}`,
      );
    if (layer.distanceM !== undefined)
      console.log(`    distance: ${layer.distanceM} m`);
    if (layer.source)
      console.log(
        `    source: ${layer.source.title} @ ${layer.source.retrievedAt}`,
      );
  }
}
