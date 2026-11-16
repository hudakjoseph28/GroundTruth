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
} as const;

export type OgripScenario = keyof typeof OGRIP_SCENARIOS;

export interface OgripRecording {
  scenario: string;
  path: string;
  recordedAt: string;
  exchanges: { url: string; status: number; body: unknown }[];
  apiResponse: { status: number; body: unknown };
}
