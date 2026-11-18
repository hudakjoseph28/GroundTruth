import { readFileSync } from "node:fs";

/**
 * Report calls recorded against live OGRIP, FEMA NFHL, the National
 * Wetlands Inventory, and Franklin County's layers by
 * scripts/record-report-fixtures.ts. Parcels were picked by looking them up
 * in the live services (2026-11-16 to 2026-11-18), not invented:
 */
export const REPORT_SCENARIOS = {
  /** 84 W Dodridge St, Columbus: Zone X (minimal), three effective LOMRs. */
  "franklin-outside": "ohio:39049:010-042534",
  /** 10034 Appleton Rd, Johnstown: Zone X (minimal), no LOMR. */
  "licking-outside": "ohio:39089:00100000601000",
  /** 0 Groveport Pike, 15.2 ac by Big Walnut Creek: only the AE floodway. */
  "franklin-floodway": "ohio:39049:185-002765",
  /** 0 Groveport Rd, 5.98 ac: AE, AE floodway, X 0.2%, and X minimal. */
  "franklin-crossing": "ohio:39049:152-001927",
  /** 17859 Township Hwy 148: Wyandot County has no NFHL study. */
  "wyandot-missing": "ohio:39175:010025000000",
  /**
   * The golden parcel (#8), Seaman Rd rear lot by the Madison County line:
   * FEMA has two FIRM panels here, Franklin 39049C0290K and Madison
   * 39097C0190E. Recorded live to compare with the seeded golden report.
   */
  "franklin-golden": "ohio:39049:230-000918",
  /**
   * 6948 Harrisburg Pike, Pleasant Township: Franklin County's zoning map
   * splits it about 53% Rural (R) and 47% Neighborhood Commercial (NC).
   * Found 2026-11-17 by scanning parcels along district boundaries.
   */
  "franklin-split": "ohio:39049:230-000397",
  /**
   * 0 Harrisburg Georgesville Rd, Pleasant Township, by Big Darby Creek: NWI
   * maps riverine, emergent wetland, and pond on it, and the county's Big
   * Darby riparian setback covers part of it. Found 2026-11-18 by querying
   * NWI emergent wetlands near Big Darby Creek, then OGRIP at each one.
   */
  "franklin-wetland-setback": "ohio:39049:230-002100",
  /**
   * 8391 Cooper Rd, Johnstown, 2.9 ac: NWI maps a forested wetland (PFO1A)
   * on about 31% of it. Found 2026-11-18 the same way, near Johnstown.
   */
  "licking-wetland": "ohio:39089:04011612400001",
  /** A well-formed Franklin key OGRIP does not publish. */
  "missing-parcel": "ohio:39049:999-999999",
} as const;

export type ReportScenario = keyof typeof REPORT_SCENARIOS;

export interface RecordedExchange {
  method: string;
  url: string;
  /** Form body of a POST (FEMA queries), exactly as sent. */
  requestBody?: string;
  status: number;
  /** A JSON answer. */
  body?: unknown;
  /** An image answer (NWI's drawing of a lot), base64. */
  bodyBase64?: string;
  contentType?: string;
  /**
   * A JSON answer too large to keep inline (a watershed's stream-setback
   * outline, 5.5 MB), saved compact under bodies/ and shared by every
   * recording that made the same request.
   */
  bodyFile?: string;
}

/** The recorded answer as the provider sent it. */
export function recordedResponse(exchange: RecordedExchange): Response {
  const init = {
    status: exchange.status,
    ...(exchange.contentType && {
      headers: { "content-type": exchange.contentType },
    }),
  };
  if (exchange.bodyBase64 !== undefined) {
    return new Response(Buffer.from(exchange.bodyBase64, "base64"), init);
  }
  if (exchange.bodyFile !== undefined) {
    return new Response(
      readFileSync(new URL(exchange.bodyFile, import.meta.url), "utf8"),
      init,
    );
  }
  return new Response(JSON.stringify(exchange.body), init);
}

export interface ReportRecording {
  scenario: string;
  parcelKey: string;
  recordedAt: string;
  exchanges: RecordedExchange[];
  apiResponse: { status: number; body: unknown };
}

export const reportPath = (parcelKey: string) =>
  `/api/parcels/${encodeURIComponent(parcelKey)}/report`;
