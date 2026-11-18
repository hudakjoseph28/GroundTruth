// Copy for parcel search and loading or failure states on the parcel page.
// Search runs against Ohio's live parcel records and can take a few seconds.

export const SEARCH = {
  title: "Search",
  lede: "Find any Ohio lot by its street address or by the county's parcel ID.",
  examplesLabel: "Try one of these:",
  /** Real parcels, each checked against the live search. */
  examples: [
    { query: "230-000918", note: "a parcel ID in Franklin County" },
    { query: "84 W Dodridge St", note: "an address in Franklin County" },
    { query: "93 Woody Knoll Dr", note: "an address in Licking County" },
  ],
  noHouseNumber: "no house number",
  county: (name: string) => `${name} County`,
  acres: (value: number) => `${value} acres`,
  loading: "Searching Ohio parcel records. This can take a few seconds.",
  matchedAddress: "Matched address",
  matchedParcelId: "Matched parcel ID",
  retry: "Try again",
} as const;

export const PARCEL_LOAD = {
  loading: "Loading the parcel from Ohio's parcel map…",
  reportLoading:
    "Loading the report. Each check is looked up when you open the parcel.",
  retry: "Try again",
} as const;
