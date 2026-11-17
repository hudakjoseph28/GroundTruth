/**
 * Times each OGRIP request an address search makes, live.
 *   pnpm --filter @groundtruth/backend time:search "<query>" ...
 *
 * Uses the production limits (OGRIP_TIMEOUT_MS default, hedging on).
 */
import { createOgripClient } from "../src/parcels/ogrip.js";

function label(url: string): string {
  const u = new URL(url);
  const p = u.searchParams;
  if (url.includes("findAddressCandidates"))
    return `locator "${p.get("SingleLine")}"`;
  const where = p.get("where") ?? "";
  if (p.get("geometryType") === "esriGeometryEnvelope") {
    const [x0, , x1] = (p.get("geometry") ?? "").split(",").map(Number);
    const halfWidthM = Math.round(
      ((x1! - x0!) / 2) * 111_320 * Math.cos((40 * Math.PI) / 180),
    );
    return `box ~${halfWidthM} m [${where}]`;
  }
  if (where.includes("SitusAddressAll LIKE"))
    return `site-address fallback [${where}]`;
  return `query [${where.slice(0, 60)}]`;
}

for (const query of process.argv.slice(2)) {
  const rows: string[] = [];
  const timed: typeof fetch = async (input, init) => {
    const started = performance.now();
    const res = await fetch(input, init);
    const text = await res.text();
    const ms = Math.round(performance.now() - started);
    let n = "";
    try {
      const body = JSON.parse(text) as {
        features?: unknown[];
        candidates?: unknown[];
        exceededTransferLimit?: boolean;
      };
      n = `${(body.features ?? body.candidates ?? []).length} rows${body.exceededTransferLimit ? " (limit hit)" : ""}`;
    } catch {}
    rows.push(
      `  ${String(ms).padStart(6)} ms  ${String(text.length).padStart(8)} B  ${n.padEnd(20)} ${label(String(input))}`,
    );
    return new Response(text, { status: res.status, headers: res.headers });
  };
  const client = createOgripClient({ fetch: timed });
  const started = performance.now();
  let outcome: string;
  try {
    const results = await client.searchByAddress(query);
    outcome =
      results
        .map((r) => `${r.parcel.key} "${r.parcel.siteAddress}"`)
        .join("; ") || "[]";
  } catch (error) {
    outcome = `ERROR ${(error as Error).name}`;
  }
  console.log(
    `\n"${query}"  total ${Math.round(performance.now() - started)} ms -> ${outcome}`,
  );
  console.log(rows.join("\n"));
}
