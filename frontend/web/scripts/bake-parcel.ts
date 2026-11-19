// Bakes the land block's assets for one parcel: real aerial imagery and real
// elevation for the parcel's padded bounding box, written where the web app
// serves them.
//
//   npx --yes pnpm@12.18.0 --filter @groundtruth/web bake:parcel ohio:39049:230-000918
//
// Writes public/parcels/<sourceParcelId>/imagery.jpg, height.png, meta.json.
// Re-run it whenever the parcel's geometry changes, then commit the three files.
//
// The building itself is backend/src/land/buildLandAssets.ts, the same code
// GET /api/parcels/:parcelKey/land runs for parcels that are not baked.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { goldenParcel, landAssetDir, secondCountyParcel, type Parcel } from "@groundtruth/shared";
import { buildLandAssets } from "../../../backend/src/land/buildLandAssets.ts";
import { EXAMPLE_PARCEL } from "../src/example/exampleFixture.ts";

// Parcels the bake can find by key. Add to this as the catalog grows. The
// example lot (EX-000250) is made up, but the land under it is real.
const CATALOG: readonly Parcel[] = [goldenParcel, secondCountyParcel, EXAMPLE_PARCEL];

async function main() {
  const wanted = process.argv[2];
  if (!wanted) {
    throw new Error("Usage: bake:parcel <parcelKey>, for example ohio:39049:230-000918");
  }
  const parcel = CATALOG.find((entry) => entry.key === wanted || entry.sourceParcelId === wanted);
  if (!parcel) {
    throw new Error(`No parcel "${wanted}" in the catalog. Add it to CATALOG in this script.`);
  }

  const { meta, imagery, height } = await buildLandAssets(parcel, {
    warn: (message) => console.warn(message),
  });
  console.log(`${parcel.key}: baked ${meta.groundMeters.width.toFixed(0)} m square`);

  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
    "parcels",
    landAssetDir(parcel.sourceParcelId),
  );
  await mkdir(out, { recursive: true });
  await writeFile(join(out, meta.imagery.file), imagery);
  await writeFile(join(out, meta.elevation.file), height);
  await writeFile(join(out, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `${meta.imagery.source}: ${meta.imagery.width}px, ${(imagery.length / 1024).toFixed(0)} KB, ` +
      `${meta.imagery.metersPerPixel.toFixed(2)} m/px`,
  );
  console.log(
    `Elevation ${meta.elevation.minMeters.toFixed(1)} to ${meta.elevation.maxMeters.toFixed(1)} m, ` +
      `${(height.length / 1024).toFixed(0)} KB`,
  );
  console.log(`Wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
