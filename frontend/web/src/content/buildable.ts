// Words for the Buildable area estimate: the card under the Bottom line, its
// layer on the land, and the reasons a constraint was left out. The estimate
// subtracts mapped constraints from the lot; it is never a site plan.

/** The Franklin County Zoning Resolution, effective 2/20/26, as the county links it. */
const ZONING_RESOLUTION =
  "https://www.franklincountyohio.gov/files/assets/public/v/1/edp/documents/zoning-resolution/zoning-resolution-2026.pdf";

export const BUILDABLE = {
  kicker: "Buildable area",
  headline: (total: string, buildable: string, share: string) =>
    `Of ${total} acres, about ${buildable} acres (${share}) look buildable`,
  disclaimer: "Estimate from public maps, not a site plan or survey.",
  removedLabel: "Land taken away by each constraint",
  overlap:
    "Where two constraints overlap, that land is counted once, under the first one listed.",
  noneOnLot: "None on the lot",
  underTenth: "Under 0.1 acre",
  skippedTitle: "Not subtracted",
  next: "Next: a surveyor or site engineer lays out the real buildable envelope on the ground.",
  /** The one Bottom line sentence, shown when less than half the lot is left. */
  bottomLine: (share: string) =>
    `Only about ${share} of the lot looks buildable on public maps. Talk to a surveyor or site engineer before you rely on a building site.`,
  layer: (acres: string, share: string) =>
    `About ${acres} acres (${share}) left after the mapped constraints are subtracted.`,
  layerMissing:
    "Needs the map layers and the elevation data; one of them did not load.",

  constraints: {
    flood: {
      label: "FEMA flood hazard area",
      detail:
        "Special Flood Hazard Area and floodway (Zones A, AE, and similar). The 0.2% annual-chance zone is not subtracted.",
    },
    wetlands: {
      label: "Mapped wetlands",
      detail:
        "National Wetlands Inventory mapping. Outlines are approximate, not a wetland delineation.",
    },
    streamSetback: {
      label: "Stream setback",
      detail:
        "The county's mapped riparian setback, which already contains the stream.",
    },
    steepSlope: {
      label: "Slopes over 15%",
      detail:
        "Ground steeper than 15% rise over run, measured on the same elevation data as the land above.",
    },
    zoningYards: {
      label: "Rural zoning side and rear yards",
      detail: (rear: string) =>
        `Side yards: 20 ft in total with at least 8 ft on one side (§302.043), drawn as 10 ft on each side. Rear yard: 20% of the lot's depth, never more than 50 ft (§302.044), about ${rear} ft here. The front of the lot is taken as the side nearest the mapped road.`,
    },
  },
  sources: {
    zoningYards: {
      title: "Franklin County Zoning Resolution §302.043–302.044",
      url: `${ZONING_RESOLUTION}#page=46`,
    },
    frontYard: {
      title: "Franklin County Zoning Resolution §302.045, §504.01",
      url: `${ZONING_RESOLUTION}#page=141`,
    },
    wetlands: {
      title: "National Wetlands Inventory",
      url: "https://www.fws.gov/program/national-wetlands-inventory/wetlands-mapper",
    },
  },
  skipped: {
    notCovered: "There is no public map of it here, so nothing was subtracted.",
    unavailable:
      "The source did not answer, so nothing was subtracted and nothing is concluded.",
    wetlandsNotCovered:
      "No National Wetlands Inventory mapping here. That does not mean there are no wetlands.",
    wetlandsUnreadable:
      "The wetland map could not be read, so nothing was subtracted.",
    frontYard: {
      label: "Front yard",
      reason:
        "§504.01 sets the building line from the road's centerline at the right-of-way's width (existing or planned, whichever is greater). The public maps here give neither, so the front yard is not subtracted.",
    },
    zoning: {
      label: "Zoning yards",
      unavailable: "The zoning map did not answer, so no yards were drawn.",
      crosses:
        "The lot crosses zoning districts, so one district's yards cannot be drawn on all of it.",
      other: (district: string) =>
        `The ${district} district's yards are not built in yet, so they were not subtracted.`,
      none: "No county zoning district covers the lot, so no yards were drawn.",
      noRoad:
        "No mapped road shows which side is the front, so the Rural yards were not drawn.",
    },
  },
} as const;
