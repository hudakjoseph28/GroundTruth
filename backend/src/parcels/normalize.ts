import type {
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  Parcel,
} from "@groundtruth/shared";
import { countyByName } from "./ohioCounties.js";
import { formatParcelKey, isKeyableParcelId } from "./parcelKey.js";

/**
 * The only OGRIP fields GroundTruth reads. The layer also publishes owner
 * mailing addresses (`MailAddressAll`, `MailCity`, ...); those are never
 * requested, and the response schema drops any field not listed here.
 */
export const PARCEL_FIELDS = [
  "County",
  "LocalParcelID",
  "StateParcelID",
  "SitusAddressAll",
  "LandArea",
  "Shape__Area",
] as const;

/**
 * OGRIP's layer is stored in EPSG:3735 (NAD83 / Ohio South, US survey
 * feet; read from the layer on 2026-11-18), so `Shape__Area` is in square
 * US survey feet, and a US survey acre is exactly 43,560 of them.
 */
const SQUARE_FEET_PER_ACRE = 43_560;

export interface ParcelAttributes {
  County?: string | null;
  LocalParcelID?: string | null;
  StateParcelID?: string | null;
  SitusAddressAll?: string | null;
  LandArea?: number | null;
  Shape__Area?: number | null;
}

export type ParcelSummary = Omit<Parcel, "geometry">;

/**
 * Maps one OGRIP feature to the v1 parcel fields, or returns null when the
 * feature cannot be keyed honestly.
 *
 * - `sourceParcelId` is `LocalParcelID`, the county's published ID.
 * - `countyFips` comes from the county name and must agree with the
 *   `StateParcelID` prefix when one is published.
 * - `acreage` is `LandArea`, which tracks the polygon's area in acres in every
 *   county that fills it (0 means not recorded, so it is omitted).
 * - `mappedAcreage` is the boundary's own area (`Shape__Area`) in acres, to
 *   two decimals. It is a map measurement, not a recorded or legal acreage:
 *   the golden lot maps at 3.04 acres; the Auditor lists 3.015.
 * - No OGRIP field carries a township; it is omitted.
 */
export function toParcelSummary(
  attributes: ParcelAttributes,
  centroid: { latitude: number; longitude: number },
): ParcelSummary | null {
  const sourceParcelId = attributes.LocalParcelID;
  if (!sourceParcelId || !isKeyableParcelId(sourceParcelId)) return null;

  const county = attributes.County ? countyByName(attributes.County) : null;
  if (!county) return null;

  const stateId = attributes.StateParcelID;
  if (stateId && stateId.split("-", 1)[0] !== county.fips) return null;

  const summary: ParcelSummary = {
    key: formatParcelKey(county.fips, sourceParcelId),
    sourceParcelId,
    county: county.name,
    countyFips: county.fips,
    centroid,
  };
  const siteAddress = cleanAddress(attributes.SitusAddressAll);
  if (siteAddress) summary.siteAddress = siteAddress;
  const acreage = attributes.LandArea;
  if (typeof acreage === "number" && Number.isFinite(acreage) && acreage > 0) {
    summary.acreage = acreage;
  }
  const area = attributes.Shape__Area;
  if (typeof area === "number" && Number.isFinite(area) && area > 0) {
    const acres = Math.round((area / SQUARE_FEET_PER_ACRE) * 100) / 100;
    if (acres > 0) summary.mappedAcreage = acres;
  }
  return summary;
}

function cleanAddress(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : undefined;
}

/**
 * True when a published site address starts with the house number and
 * contains the street name as whole words. Directions and street types are
 * not compared: the locator drops them (`84 W DODRIDGE ST` → `84 DODRIDGE`).
 */
export function siteAddressMatches(
  siteAddress: string | null | undefined,
  houseNumber: string,
  streetName: string,
): boolean {
  const words = addressWords(siteAddress ?? "");
  const street = addressWords(streetName);
  if (words[0] !== houseNumber.toUpperCase() || street.length === 0) {
    return false;
  }
  for (let start = 1; start + street.length <= words.length; start += 1) {
    if (street.every((word, offset) => words[start + offset] === word)) {
      return true;
    }
  }
  return false;
}

function addressWords(value: string): string[] {
  return value
    .toUpperCase()
    .split(/[\s,]+/)
    .filter((word) => word.length > 0);
}

type Ring = number[][];

/**
 * Area-weighted centroid of a polygon or multipolygon, with holes
 * subtracted. Planar math in longitude/latitude is accurate at parcel scale.
 * Vertices are shifted to a local origin first: on raw Ohio coordinates the
 * shoelace terms are about 3,300 while a lot's area is about 1e-8 square
 * degrees, and the cancellation can put the centroid outside the lot.
 */
export function polygonCentroid(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): {
  latitude: number;
  longitude: number;
} | null {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const [originX = 0, originY = 0] = polygons[0]?.[0]?.[0] ?? [];
  let area = 0;
  let x = 0;
  let y = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => {
      const part = ringMoments(ring, originX, originY);
      // GeoJSON and Esri disagree on ring winding; the outer ring adds and
      // every inner ring (hole) subtracts, whatever its orientation.
      const sign = index === 0 ? 1 : -1;
      const ringSign = Math.sign(part.area) || 1;
      area += sign * Math.abs(part.area);
      x += sign * ringSign * part.x;
      y += sign * ringSign * part.y;
    });
  }
  if (Math.abs(area) < 1e-14) return vertexAverage(polygons);
  const longitude = originX + x / (3 * area);
  const latitude = originY + y / (3 * area);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { latitude, longitude };
}

function ringMoments(
  ring: Ring,
  originX: number,
  originY: number,
): { area: number; x: number; y: number } {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < ring.length; i += 1) {
    const [ax = 0, ay = 0] = ring[i] ?? [];
    const [bx = 0, by = 0] = ring[i + 1] ?? [];
    const x0 = ax - originX;
    const y0 = ay - originY;
    const x1 = bx - originX;
    const y1 = by - originY;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  return { area: area / 2, x: x / 2, y: y / 2 };
}

function vertexAverage(
  polygons: number[][][][],
): { latitude: number; longitude: number } | null {
  const points = polygons.flatMap((polygon) => polygon[0] ?? []);
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, [lon = 0, lat = 0]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lon: 0, lat: 0 },
  );
  return {
    latitude: sum.lat / points.length,
    longitude: sum.lon / points.length,
  };
}
