// Copy for parcel search and loading or failure states on the parcel page.
// Search runs against Ohio's live parcel records and can take a few seconds.

export const SEARCH = {
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
