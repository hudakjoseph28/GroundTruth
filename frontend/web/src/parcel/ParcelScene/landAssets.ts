import type { Parcel } from "@groundtruth/shared";
import { isLandMeta, landAssetDir, type LandMeta } from "./landMeta";

/** One parcel's land assets, decoded and ready to draw. */
export interface LandAssets {
  meta: LandMeta;
  imageryUrl: string;
  imagery: HTMLImageElement;
  /** Heights from 0 (lowest) to 1 (highest), row 0 at the north edge. */
  heights: Float32Array;
  heightSize: number;
  /** Baked into the web app, or built by the API on demand. */
  origin: "baked" | "built";
}

/**
 * How long the parcel page waits for the API to build a land block before it
 * shows the flat boundary instead. The build keeps going on the server and is
 * cached, so a later visit gets the 3D block.
 */
export const LAND_BUILD_DEADLINE_MS = 10_000;

export type LandPhase = "baked" | "building";

const cache = new Map<string, Promise<LandAssets | null>>();
/** Parcels whose API build is in progress, and who wants to hear about it. */
const building = new Set<string>();
const listeners = new Map<string, Set<(phase: LandPhase) => void>>();

/**
 * The parcel's land assets: the baked files when the web app has them,
 * otherwise built by GET /api/parcels/:parcelKey/land. Resolves to null when
 * neither is available in time. Never rejects. `onPhase` hears "building"
 * once the baked files are known to be missing, including for a caller that
 * joins a load already under way.
 */
export function loadLandAssets(
  parcel: Pick<Parcel, "key" | "sourceParcelId">,
  onPhase?: (phase: LandPhase) => void,
): Promise<LandAssets | null> {
  const { key } = parcel;
  if (onPhase) {
    if (building.has(key)) onPhase("building");
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(onPhase);
  }
  let pending = cache.get(key);
  if (!pending) {
    pending = load(parcel, () => {
      building.add(key);
      for (const listener of listeners.get(key) ?? []) listener("building");
    })
      .catch(() => null)
      .then((assets) => {
        building.delete(key);
        listeners.delete(key);
        // A failed or slow build may succeed later; let the next visit retry.
        if (!assets) cache.delete(key);
        return assets;
      });
    cache.set(key, pending);
  }
  return pending;
}

async function load(
  parcel: Pick<Parcel, "key" | "sourceParcelId">,
  startBuilding: () => void,
): Promise<LandAssets | null> {
  const baked = await loadBaked(parcel.sourceParcelId).catch(() => null);
  if (baked) return baked;
  startBuilding();
  return loadBuilt(parcel.key);
}

async function loadBaked(sourceParcelId: string): Promise<LandAssets | null> {
  const base = `${import.meta.env.BASE_URL}parcels/${landAssetDir(sourceParcelId)}/`;
  const response = await fetch(`${base}meta.json`);
  if (!response.ok) return null;
  // An unbaked parcel gets the app shell back, which is not JSON.
  const meta: unknown = await response.json().catch(() => null);
  if (!isLandMeta(meta)) return null;
  return decode(meta, base, "baked");
}

/** The API builds the assets from the parcel's OGRIP boundary on first ask. */
async function loadBuilt(parcelKey: string): Promise<LandAssets | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, LAND_BUILD_DEADLINE_MS);
  });
  const base = `/api/parcels/${encodeURIComponent(parcelKey)}/land/`;
  const attempt = (async () => {
    const response = await fetch(base.slice(0, -1), { signal: controller.signal });
    if (!response.ok) return null;
    const meta: unknown = await response.json().catch(() => null);
    if (!isLandMeta(meta)) return null;
    return decode(meta, base, "built");
  })().catch(() => null);
  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

async function decode(
  meta: LandMeta,
  base: string,
  origin: LandAssets["origin"],
): Promise<LandAssets | null> {
  const imageryUrl = base + meta.imagery.file;
  const [imagery, heightImage] = await Promise.all([
    loadImage(imageryUrl),
    loadImage(base + meta.elevation.file),
  ]);

  const size = heightImage.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = heightImage.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || size < 2 || canvas.height !== size) return null;
  context.drawImage(heightImage, 0, 0);
  const pixels = context.getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) heights[i] = pixels[i * 4]! / 255;

  return { meta, imageryUrl, imagery, heights, heightSize: size, origin };
}

/** Bilinear height, 0..1, at a point in the baked region (u east, v south). */
export function heightAt(assets: LandAssets, u: number, v: number): number {
  const size = assets.heightSize;
  const x = Math.min(size - 1, Math.max(0, u * size - 0.5));
  const y = Math.min(size - 1, Math.max(0, v * size - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (col: number, row: number) => assets.heights[row * size + col]!;
  const north = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const south = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return north * (1 - fy) + south * fy;
}
