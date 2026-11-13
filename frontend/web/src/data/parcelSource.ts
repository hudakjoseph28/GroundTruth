import {
  stagedParcel,
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
const catalog: readonly Parcel[] = [stagedParcel];

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
        "No staged parcel matched. Live Ohio records are not connected. The sample parcel ID is STAGED-DEMO.",
    };
  }
  return { status: "results", results };
}

export function getParcel(parcelKey: string): Parcel | null {
  return catalog.find((parcel) => parcel.key === parcelKey) ?? null;
}

export function getParcelReport(parcelKey: string): ParcelReport | null {
  const parcel = getParcel(parcelKey);
  if (!parcel) return null;
  return null;
}

export function sampleParcelPath(): string {
  return parcelPath(stagedParcel.key);
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
  if (
    parcel.sourceParcelId.toLowerCase().includes(needle) ||
    parcel.key.toLowerCase().includes(needle)
  ) {
    return "parcelId";
  }
  return null;
}
