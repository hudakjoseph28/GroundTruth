// Copy for parcel search and loading or failure states on the parcel page.
// Search runs against Ohio's live parcel records and can take a few seconds.

/**
 * Searches that return a real Ohio parcel, checked against live OGRIP on
 * 2026-11-18: a Columbus street address and a Pleasant Township parcel ID
 * (Franklin), and a Johnstown street address (Licking).
 */
export const SEARCH_EXAMPLES = [
  { query: "84 W Dodridge St, Columbus", kind: "Address" },
  { query: "10034 Appleton Rd, Johnstown", kind: "Address" },
  { query: "230-000918", kind: "Parcel ID" },
] as const;

export const SEARCH = {
  title: "Search",
  lede: "Find any Ohio lot by its street address or by the county's parcel ID.",
  loading: "Searching Ohio parcel records. This can take a few seconds.",
  examplesLabel: "Try",
  matchedAddress: "Matched address",
  matchedParcelId: "Matched parcel ID",
  parcelId: (id: string) => `Parcel ${id}`,
  county: (name: string) => `${name} County, Ohio`,
  noAddress: "No site address published",
  noHouseNumber: "no house number",
  /** Recorded by the county (OGRIP `LandArea`). */
  acres: (value: number) => `${formatAcres(value)} acres`,
  /** Measured from the mapped boundary; never a recorded or legal acreage. */
  mappedAcres: (value: number) => `About ${formatAcres(value)} acres, mapped`,
  noAcreage: "Acreage not published",
  empty: (query: string) =>
    `No Ohio parcel matched “${query}”. Try the parcel ID instead: it is on the county auditor’s website and the tax bill, like 230-000918. A street name on its own also works, like Dodridge St.`,
  retry: "Try again",
} as const;

function formatAcres(value: number): string {
  return value < 0.01 ? "less than 0.01" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const PARCEL_LOAD = {
  loading: "Loading the parcel from Ohio's parcel map…",
  reportLoading:
    "Loading the report. Each check is looked up when you open the parcel.",
  retry: "Try again",
} as const;
