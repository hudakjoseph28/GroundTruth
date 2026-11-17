/**
 * Report calls recorded against live OGRIP and FEMA NFHL by
 * scripts/record-report-fixtures.ts. Parcels were picked by looking them up
 * in both services on 2026-11-16, not invented:
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
  body: unknown;
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
