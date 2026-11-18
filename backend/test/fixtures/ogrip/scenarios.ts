/** API calls recorded against live OGRIP by scripts/record-ogrip-fixtures.ts. */
export const OGRIP_SCENARIOS = {
  "franklin-address": `/api/parcels/search?q=${encodeURIComponent("84 W Dodridge St, Columbus, OH 43202")}`,
  "franklin-parcel-id": "/api/parcels/search?q=010-042534",
  "licking-address": `/api/parcels/search?q=${encodeURIComponent("10034 Appleton Rd Johnstown 43031")}`,
  "licking-parcel-id": "/api/parcels/search?q=001-000006-01.000",
  "no-match-parcel-id": "/api/parcels/search?q=ZZ-404-000404",
  "no-match-address": `/api/parcels/search?q=${encodeURIComponent("1600 Pennsylvania Ave NW, Washington, DC 20500")}`,
  "franklin-parcel": `/api/parcels/${encodeURIComponent("ohio:39049:010-042534")}`,
  "licking-parcel": `/api/parcels/${encodeURIComponent("ohio:39089:00100000601000")}`,
  "missing-parcel": `/api/parcels/${encodeURIComponent("ohio:39049:999-999999")}`,
  coverage: "/api/coverage",
  "franklin-parcel-id-compact": "/api/parcels/search?q=010042534",
  "franklin-parcel-id-spaced": `/api/parcels/search?q=${encodeURIComponent("010 042534")}`,
  "licking-parcel-id-published": "/api/parcels/search?q=00100000601000",
  "licking-address-no-zip": `/api/parcels/search?q=${encodeURIComponent("10034 Appleton Rd Johnstown OH")}`,
  "licking-address-city-comma": `/api/parcels/search?q=${encodeURIComponent("10034 Appleton Rd, Johnstown")}`,
  "licking-main-st-no-zip": `/api/parcels/search?q=${encodeURIComponent("57 S Main St Johnstown OH")}`,
  "johnstown-no-such-address": `/api/parcels/search?q=${encodeURIComponent("123 Main St Johnstown OH")}`,
  "locator-down-with-city": `/api/parcels/search?q=${encodeURIComponent("57 S Main St, Johnstown")}`,
  "locator-down-without-city": `/api/parcels/search?q=${encodeURIComponent("84 W Dodridge St")}`,
  /** OGRIP publishes 1739 S High St only; N must not return it. */
  "high-1739-north": `/api/parcels/search?q=${encodeURIComponent("1739 N High St, Columbus")}`,
  "high-1739-south": `/api/parcels/search?q=${encodeURIComponent("1739 S High St, Columbus")}`,
  "high-1739-north-spelled": `/api/parcels/search?q=${encodeURIComponent("1739 North High Street, Columbus")}`,
  /** 750 N High St and 750 S High St both exist in Columbus. */
  "high-750-no-direction": `/api/parcels/search?q=${encodeURIComponent("750 High St, Columbus")}`,
  "high-750-north": `/api/parcels/search?q=${encodeURIComponent("750 N High St, Columbus")}`,
  "high-750-north-spelled": `/api/parcels/search?q=${encodeURIComponent("750 North High Street, Columbus")}`,
  /** The golden parcel publishes `0 SEAMAN RD`: a rear lot with no number. */
  "seaman-0": `/api/parcels/search?q=${encodeURIComponent("0 Seaman Rd")}`,
  "seaman-0-galloway": `/api/parcels/search?q=${encodeURIComponent("0 Seaman Rd, Galloway")}`,
  "seaman-0-locator-down": `/api/parcels/search?q=${encodeURIComponent("0 Seaman Rd")}`,
} as const;

/**
 * Scenarios recorded with the OGRIP locator forced to answer HTTP 503, so
 * the parcel-layer fallback runs against real responses.
 */
export const LOCATOR_DOWN: ReadonlySet<OgripScenario> = new Set([
  "locator-down-with-city",
  "locator-down-without-city",
  "seaman-0-locator-down",
]);

export type OgripScenario = keyof typeof OGRIP_SCENARIOS;

export interface OgripRecording {
  scenario: string;
  path: string;
  recordedAt: string;
  exchanges: {
    url: string;
    status: number;
    body: unknown;
    /** Set when the recorder answered instead of OGRIP (forced outage). */
    forcedFailure?: true;
  }[];
  apiResponse: { status: number; body: unknown };
}
