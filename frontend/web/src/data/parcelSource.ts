import {
  goldenParcel,
  goldenReport,
  secondCountyParcel,
  secondCountyReport,
  type Parcel,
  type ParcelReport,
  type ParcelSearchResult,
} from "@groundtruth/shared";

const MIN_QUERY = 3;
const MAX_QUERY = 120;

/**
 * Staged catalog behind the UI.
 * Satya: replace these three functions with the v1 routes. Keep the return shapes.
 * GET /api/parcels/search?q=
 * GET /api/parcels/:parcelKey
 * GET /api/parcels/:parcelKey/report
 */
const catalog: readonly Parcel[] = [goldenParcel, secondCountyParcel];
const reports: readonly ParcelReport[] = [goldenReport, secondCountyReport];

export type SearchOutcome =
  | { status: "invalid"; message: string }
  | { status: "empty"; message: string }
  | { status: "results"; results: ParcelSearchResult[] };

export function searchParcels(rawQuery: string): SearchOutcome {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY) {
    return {
      status: "invalid",
      message:
        "Enter at least 3 characters. Use a street address or a parcel ID.",
    };
  }
  if (query.length > MAX_QUERY) {
    return {
      status: "invalid",
      message: "Use 120 characters or fewer.",
    };
  }

  const needle = query.toLowerCase();
  const results: ParcelSearchResult[] = [];
  for (const parcel of catalog) {
    const matchedOn = matchParcel(parcel, needle);
    if (!matchedOn) continue;
    results.push({ parcel: withoutGeometry(parcel), matchedOn });
  }

  if (results.length === 0) {
    return {
      status: "empty",
      message:
        "No sample parcel matched. Live Ohio search is not connected here yet. Try the sample parcel ID 230-000918.",
    };
  }
  return { status: "results", results };
}

export function getParcel(parcelKey: string): Parcel | null {
  return catalog.find((parcel) => parcel.key === parcelKey) ?? null;
}

export function getParcelReport(parcelKey: string): ParcelReport | null {
  return reports.find((report) => report.parcelKey === parcelKey) ?? null;
}

export function sampleParcelPath(): string {
  return parcelPath(goldenParcel.key);
}

export function parcelPath(parcelKey: string): string {
  return `/parcels/${encodeURIComponent(parcelKey)}`;
}

function withoutGeometry(parcel: Parcel): ParcelSearchResult["parcel"] {
  return {
    key: parcel.key,
    sourceParcelId: parcel.sourceParcelId,
    county: parcel.county,
    countyFips: parcel.countyFips,
    township: parcel.township,
    siteAddress: parcel.siteAddress,
    acreage: parcel.acreage,
    centroid: parcel.centroid,
  };
}

function matchParcel(
  parcel: Parcel,
  needle: string,
): ParcelSearchResult["matchedOn"] | null {
  const address = parcel.siteAddress?.toLowerCase();
  if (address?.includes(needle)) return "siteAddress";
  // Parcel IDs match with or without punctuation: 230-000918 or 230000918.
  const compactNeedle = compactId(needle);
  if (
    parcel.sourceParcelId.toLowerCase().includes(needle) ||
    parcel.key.toLowerCase().includes(needle) ||
    (compactNeedle.length >= 3 &&
      compactId(parcel.sourceParcelId).includes(compactNeedle))
  ) {
    return "parcelId";
  }
  return null;
}

function compactId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
