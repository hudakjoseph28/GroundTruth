import type { Prisma, PrismaClient } from "@prisma/client";
import { isLandMeta, LAND_META_VERSION, outerRing } from "@groundtruth/shared";
import type { OgripClient } from "../parcels/ogrip.js";
import {
  buildLandAssets,
  type BuildLandOptions,
  type LandAssetFiles,
} from "./buildLandAssets.js";

/** How long built assets are served before they are rebuilt. NAIP updates every few years. */
export const LAND_ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
/** Built assets kept in memory (about 0.2 to 1.4 MB each). */
export const LAND_MEMORY_ENTRIES = 24;

/** Built land assets in PostgreSQL, so a restart does not rebuild them. */
export interface LandAssetStore {
  read(parcelKey: string, now: Date): Promise<LandAssetFiles | null>;
  write(
    parcelKey: string,
    files: LandAssetFiles,
    expiresAt: Date,
  ): Promise<void>;
}

export function prismaLandAssetStore(prisma: PrismaClient): LandAssetStore {
  return {
    async read(parcelKey, now) {
      const row = await prisma.landAssetRecord.findUnique({
        where: { parcelKey },
      });
      if (!row || row.version !== LAND_META_VERSION) return null;
      if (row.expiresAt.getTime() <= now.getTime()) return null;
      const meta: unknown = row.meta;
      if (!isLandMeta(meta)) return null;
      return {
        meta,
        imagery: Buffer.from(row.imagery),
        height: Buffer.from(row.height),
      };
    },
    async write(parcelKey, files, expiresAt) {
      const data = {
        version: LAND_META_VERSION,
        meta: files.meta as unknown as Prisma.InputJsonValue,
        // Prisma's Bytes wants a plain Uint8Array over an ArrayBuffer.
        imagery: new Uint8Array(files.imagery),
        height: new Uint8Array(files.height),
        expiresAt,
      };
      await prisma.landAssetRecord.upsert({
        where: { parcelKey },
        create: { parcelKey, ...data },
        update: { ...data, createdAt: new Date() },
      });
    },
  };
}

/** The parcel exists but its geometry has no outer ring to draw. */
export class NoDrawableBoundaryError extends Error {
  constructor() {
    super("The parcel has no drawable boundary.");
    this.name = "NoDrawableBoundaryError";
  }
}

export interface LandAssetServiceOptions {
  ogrip: OgripClient;
  store: LandAssetStore;
  build?: typeof buildLandAssets;
  buildOptions?: BuildLandOptions;
  ttlMs?: number;
  memoryEntries?: number;
  now?: () => Date;
  /** Public chain of events only: never logs payloads. */
  log?: (message: string) => void;
}

export interface LandAssetService {
  /**
   * The parcel's land assets: from memory, then PostgreSQL, else built from
   * its OGRIP boundary. Null when OGRIP has no such parcel. Throws
   * OgripError, or the imagery or elevation service's error.
   */
  get(
    countyFips: string,
    sourceParcelId: string,
    parcelKey: string,
  ): Promise<LandAssetFiles | null>;
}

/**
 * Builds each parcel at most once at a time. A build runs to completion
 * and is cached even if the request that started it gives up (the web
 * stops waiting after about 10 s), so the next visit is served from cache.
 */
export function createLandAssetService(
  options: LandAssetServiceOptions,
): LandAssetService {
  const build = options.build ?? buildLandAssets;
  const ttlMs = options.ttlMs ?? LAND_ASSET_TTL_MS;
  const memoryEntries = options.memoryEntries ?? LAND_MEMORY_ENTRIES;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((message: string) => console.log(message));
  const memory = new Map<
    string,
    { files: LandAssetFiles; expiresAt: number }
  >();
  const inFlight = new Map<string, Promise<LandAssetFiles | null>>();

  function remember(
    parcelKey: string,
    files: LandAssetFiles,
    expiresAt: number,
  ) {
    memory.delete(parcelKey);
    memory.set(parcelKey, { files, expiresAt });
    while (memory.size > memoryEntries) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      memory.delete(oldest);
    }
  }

  async function load(
    countyFips: string,
    sourceParcelId: string,
    parcelKey: string,
  ): Promise<LandAssetFiles | null> {
    try {
      const stored = await options.store.read(parcelKey, now());
      if (stored) {
        remember(parcelKey, stored, now().getTime() + ttlMs);
        return stored;
      }
    } catch {
      // The cache is optional: a database failure only costs a rebuild.
      log(`land ${parcelKey}: cache read failed; building`);
    }
    const parcel = await options.ogrip.getParcel(countyFips, sourceParcelId);
    if (!parcel) return null;
    if (outerRing(parcel.geometry.geojson).length < 3) {
      throw new NoDrawableBoundaryError();
    }
    const started = now().getTime();
    const files = await build(parcel, options.buildOptions);
    const expiresAt = now().getTime() + ttlMs;
    log(
      `land ${parcelKey}: built in ${now().getTime() - started} ms (${files.meta.imagery.source})`,
    );
    remember(parcelKey, files, expiresAt);
    await options.store
      .write(parcelKey, files, new Date(expiresAt))
      .catch(() => {
        log(`land ${parcelKey}: cache write failed`);
      });
    return files;
  }

  return {
    get(countyFips, sourceParcelId, parcelKey) {
      const cached = memory.get(parcelKey);
      if (cached && cached.expiresAt > now().getTime()) {
        remember(parcelKey, cached.files, cached.expiresAt);
        return Promise.resolve(cached.files);
      }
      let pending = inFlight.get(parcelKey);
      if (!pending) {
        pending = load(countyFips, sourceParcelId, parcelKey).finally(() => {
          inFlight.delete(parcelKey);
        });
        inFlight.set(parcelKey, pending);
      }
      return pending;
    },
  };
}
