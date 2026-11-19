// Copy for /explore: the map of Ohio that draws parcel outlines from zoom 15.

export const EXPLORE_MAP = {
  title: "Explore Ohio parcels",
  mapLabel: "Map of Ohio parcels. Drag to pan; zoom in to see parcel outlines.",
  zoomIn: "Zoom in to see parcels",
  zoomInAction: "Zoom in",
  loading: "Loading parcels from Ohio's parcel map…",
  outside: "This area is outside Ohio. GroundTruth maps parcels in Ohio's 88 counties.",
  timeout: "Ohio's parcel map is taking too long. Try again in a moment.",
  none: "No parcels are mapped in this view.",
  truncated: (count: number) =>
    `Showing ${count.toLocaleString("en-US")} parcels. Zoom in to see every lot here.`,
  count: (count: number) =>
    count === 1 ? "1 parcel in view" : `${count.toLocaleString("en-US")} parcels in view`,
  retry: "Try again",
  basemapLabel: "Map style",
  basemaps: { imagery: "Aerial", streets: "Streets" },
  card: {
    label: "Selected parcel",
    close: "Close",
    open: "Open report",
    source: "Boundary from Ohio OGRIP. Not a survey.",
  },
  search: {
    label: "Search this area",
    placeholder: "Search this area",
    hint: "A street address, a street name, or a county parcel ID",
    submit: "Search",
    clear: "Clear search",
    inView: "In this view",
    elsewhere: "Ohio parcel records, nearest first",
    searching: "Searching Ohio parcel records…",
    away: (km: number) => (km < 1 ? "under 1 km away" : `${Math.round(km).toLocaleString("en-US")} km away`),
  },
  link: "Browse the map of Ohio",
  linkNote: "See every parcel outline as you zoom in",
  attribution: "Parcels: Ohio OGRIP",
} as const;
