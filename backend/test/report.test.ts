import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import {
  goldenParcel,
  goldenReport,
  type Check,
  type Parcel,
  type ParcelReport,
} from "@groundtruth/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  createOgripClient,
  OGRIP_PARCELS_LAYER,
} from "../src/parcels/ogrip.js";
import {
  createFemaFloodClient,
  NFHL_SERVICE,
} from "../src/reports/femaFlood.js";
import {
  createFranklinZoningClient,
  FCEDP_ZONING_LAYER,
  measure,
} from "../src/reports/franklinZoning.js";
import {
  createFranklinAccessClient,
  FCEO_ROAD_LAYER,
  FRANKLIN_ROW_LAYER,
} from "../src/reports/franklinAccess.js";
import { createSsurgoSoilsClient } from "../src/reports/ssurgoSoils.js";
import { prismaReportStore, type ReportStore } from "../src/reports/store.js";
import { LIVE_REPORT_TTL_MS } from "../src/routes/report.js";
import {
  REPORT_SCENARIOS,
  reportPath,
  type ReportRecording,
  type ReportScenario,
} from "./fixtures/report/scenarios.js";
import { floodEvidence } from "./support/floodEvidence.js";

function load(name: ReportScenario): ReportRecording {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/report/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as ReportRecording;
}

const requestId = (method: string, url: string, body?: string) =>
  `${method} ${url}\n${body ?? ""}`;

/** Serves recorded OGRIP and FEMA responses by exact request; anything else fails. */
function replay(recording: ReportRecording) {
  const byRequest = new Map(
    recording.exchanges.map((e) => [
      requestId(e.method, e.url, e.requestBody),
      e,
    ]),
  );
  return vi.fn<typeof fetch>(async (input, init) => {
    const key = requestId(
      init?.method ?? "GET",
      String(input),
      typeof init?.body === "string" ? init.body : undefined,
    );
    const recorded = byRequest.get(key);
    if (!recorded) throw new Error(`unrecorded request: ${key.slice(0, 200)}`);
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
    });
  });
}

const isFema = (input: unknown) => String(input).startsWith(NFHL_SERVICE);

/** An in-memory store: `seed` reports are served, writes are recorded. */
function memoryStore(seed: ParcelReport[] = []) {
  const rows = new Map(
    seed.map((report) => [
      report.parcelKey,
      { report, expiresAt: null as Date | null },
    ]),
  );
  const store = {
    read: vi.fn<ReportStore["read"]>(async (key, now) => {
      const row = rows.get(key);
      if (!row) return null;
      if (row.expiresAt && row.expiresAt <= now) return null;
      return row.report;
    }),
    write: vi.fn<ReportStore["write"]>(async (parcel, report, expiresAt) => {
      if (rows.get(parcel.key)?.expiresAt === null) return;
      rows.set(parcel.key, { report, expiresAt });
    }),
  };
  return store;
}

interface AppSetup {
  fetch: typeof fetch;
  at: Date;
  store?: ReportStore;
  femaFetch?: typeof fetch;
  floodTimeoutMs?: number;
  /** Franklin County zoning map; defaults to the replayed recording. */
  zoningFetch?: typeof fetch;
  zoningTimeoutMs?: number;
  /** Franklin County right-of-way and road layers; defaults to the recording. */
  accessFetch?: typeof fetch;
  accessTimeoutMs?: number;
  /** USDA Soil Data Access; absent keeps legacy recordings soils-free. */
  soilsFetch?: typeof fetch;
  soilsTimeoutMs?: number;
}

function appWith(setup: AppSetup) {
  const now = () => setup.at;
  return createApp("test-commit", {
    ogrip: createOgripClient({ fetch: setup.fetch, now, timeoutMs: 1_000 }),
    report: {
      fema: createFemaFloodClient({
        fetch: setup.femaFetch ?? setup.fetch,
        now,
      }),
      zoning: createFranklinZoningClient({
        fetch: setup.zoningFetch ?? setup.fetch,
        now,
      }),
      access: createFranklinAccessClient({
        fetch: setup.accessFetch ?? setup.fetch,
        now,
      }),
      soils: setup.soilsFetch
        ? createSsurgoSoilsClient({ fetch: setup.soilsFetch, now })
        : null,
      store: setup.store ?? memoryStore(),
      floodTimeoutMs: setup.floodTimeoutMs ?? 1_000,
      zoningTimeoutMs: setup.zoningTimeoutMs ?? 1_000,
      accessTimeoutMs: setup.accessTimeoutMs ?? 1_000,
      soilsTimeoutMs: setup.soilsTimeoutMs ?? 1_000,
      now,
    },
  });
}

function scenario(name: ReportScenario, overrides: Partial<AppSetup> = {}) {
  const recording = load(name);
  const fetchImpl = replay(recording);
  const store = overrides.store ?? memoryStore();
  const app = appWith({
    fetch: fetchImpl,
    at: new Date(recording.recordedAt),
    store,
    ...overrides,
  });
  return { app, recording, fetchImpl, store };
}

function checkOf(report: ParcelReport, kind: Check["kind"]): Check {
  const check = report.checks.find((item) => item.kind === kind);
  if (!check) throw new Error(`no ${kind} check`);
  return check;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/parcels/:parcelKey/report, live from recorded OGRIP + FEMA", () => {
  it("builds the Franklin report: Zone X with dated FIRM panel and LOMRs, mapped road access, the rest unknown", async () => {
    const { app, recording } = scenario("franklin-outside");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-outside"]),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(recording.apiResponse.body);
    const report = res.body as ParcelReport;
    expect(report).toMatchObject({
      parcelKey: "ohio:39049:010-042534",
      generatedAt: recording.recordedAt,
      coverage: "partial",
      // Access has county evidence, so the first open question is septic.
      biggestOpenQuestion: "septic",
    });
    expect(report.checks.map((check) => check.kind)).toEqual([
      "zoning",
      "flood",
      "access",
      "utilities",
      "easements",
      "sellerAuthority",
      "survey",
      "septic",
    ]);

    const flood = checkOf(report, "flood");
    expect(flood.status).toBe("evidenceFound");
    expect(flood.finding).toBe(
      "FEMA's flood map puts this lot in Zone X (area of minimal flood hazard). No part of it is mapped in a Special Flood Hazard Area.",
    );
    expect(flood.sources).toContainEqual({
      authority: "FEMA",
      title: "Flood Insurance Rate Map panel 39049C0169K",
      url: `${NFHL_SERVICE}/3`,
      retrievedAt: recording.recordedAt,
      effectiveDate: "2008-06-17",
    });
    expect(flood.sources).toContainEqual(
      expect.objectContaining({
        title: "Letter of Map Revision 15-05-3155P",
        effectiveDate: "2016-04-20",
      }),
    );

    // A Columbus lot: Franklin County's zoning map does not cover it.
    const zoning = checkOf(report, "zoning");
    expect(zoning).toMatchObject({
      status: "unknown",
      responsibleParty: {
        role: "Zoning office for the city, village, or township that contains the lot",
      },
    });
    expect(zoning.finding).toMatch(
      /^Franklin County's zoning map does not cover this parcel\./,
    );
    expect(zoning.sources).toEqual([
      expect.objectContaining({
        url: FCEDP_ZONING_LAYER,
        retrievedAt: recording.recordedAt,
      }),
    ]);

    expect(checkOf(report, "access").status).toBe("evidenceFound");

    for (const check of report.checks.filter(
      (c) => !["flood", "zoning", "access"].includes(c.kind),
    )) {
      expect(check.status).toBe("unknown");
      expect(check.sources).toEqual([]);
      expect(check.responsibleParty.role).not.toBe("");
      expect(check.nextAction).not.toBe("");
    }
  });

  it("builds the Licking report with its own FIRM date and no Franklin links", async () => {
    const { app } = scenario("licking-outside");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["licking-outside"]),
    );

    expect(res.status).toBe(200);
    const report = res.body as ParcelReport;
    const flood = checkOf(report, "flood");
    expect(flood.status).toBe("evidenceFound");
    expect(flood.finding).toContain("Zone X (area of minimal flood hazard)");
    expect(flood.sources.map((source) => source.effectiveDate)).toContain(
      "2015-03-16",
    );
    expect(checkOf(report, "easements").responsibleParty).toEqual({
      role: "Title reviewer",
      organization: "Licking County Recorder",
    });
    expect(JSON.stringify(report)).not.toContain("franklincountyohio.gov");
    expect(checkOf(report, "zoning").limitation).toContain("Licking County");
  });

  it("names a Special Flood Hazard Area for a parcel inside the AE floodway", async () => {
    const { app } = scenario("franklin-floodway");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-floodway"]),
    );

    expect(res.status).toBe(200);
    const flood = checkOf(res.body as ParcelReport, "flood");
    expect(flood.status).toBe("evidenceFound");
    expect(flood.finding).toBe(
      "FEMA's flood map puts this lot in Zone AE (regulatory floodway), a Special Flood Hazard Area (FEMA's 1%-annual-chance floodplain).",
    );
    expect(flood.nextAction).toContain("flood insurance");
    expect(flood.nextAction).toContain("floodway");
    expect(flood.responsibleParty.role).toContain("floodplain administrator");
    expect(
      flood.sources.filter((source) => source.effectiveDate).length,
    ).toBeGreaterThan(0);
  });

  it("says plainly when a parcel crosses several zones", async () => {
    const { app } = scenario("franklin-crossing");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-crossing"]),
    );

    expect(res.status).toBe(200);
    const flood = checkOf(res.body as ParcelReport, "flood");
    expect(flood.status).toBe("evidenceFound");
    expect(flood.finding).toBe(
      "The lot crosses 4 FEMA flood zones: Zone AE, Zone AE (regulatory floodway), Zone X (0.2% annual chance flood hazard), and Zone X (area of minimal flood hazard). Part of it is in a Special Flood Hazard Area (FEMA's 1%-annual-chance floodplain).",
    );
    expect(flood.limitation).toContain(
      "has not measured how much of the lot lies in each zone",
    );
  });

  it("keeps flood unknown, with the dated query, where NFHL has no data", async () => {
    const { app, recording } = scenario("wyandot-missing");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["wyandot-missing"]),
    );

    expect(res.status).toBe(200);
    const report = res.body as ParcelReport;
    expect(report.coverage).toBe("boundaryOnly");
    const flood = checkOf(report, "flood");
    expect(flood.status).toBe("unknown");
    expect(flood.finding).toBe(
      "FEMA's National Flood Hazard Layer has no digital flood map covering this lot.",
    );
    expect(flood.limitation).toContain("not a finding of low flood risk");
    expect(flood.sources).toEqual([
      expect.objectContaining({
        title: "National Flood Hazard Layer: study availability",
        retrievedAt: recording.recordedAt,
      }),
      expect.objectContaining({
        title: "National Flood Hazard Layer: flood hazard zones",
        retrievedAt: recording.recordedAt,
      }),
    ]);
  });
});

describe("a parcel on two FIRM panels (golden parcel 230-000918)", () => {
  it("cites both panels, Franklin and Madison, each with its own effective date", async () => {
    const { app, recording } = scenario("franklin-golden");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-golden"]),
    );

    expect(res.status).toBe(200);
    const flood = checkOf(res.body as ParcelReport, "flood");
    // The values hand-verified for the golden report in #8.
    expect(floodEvidence(flood)).toEqual({
      status: "evidenceFound",
      zones: ["X: area of minimal flood hazard"],
      panels: ["39049C0290K@2008-06-17", "39097C0190E@2023-11-16"],
    });

    // FEMA lists Madison's panel first; the report does not depend on it.
    const panelAnswer = recording.exchanges.find((e) =>
      e.url.endsWith("/MapServer/3/query"),
    )?.body as { features: { attributes: { FIRM_PAN: string } }[] };
    expect(panelAnswer.features.map((f) => f.attributes.FIRM_PAN)).toEqual([
      "39097C0190E",
      "39049C0290K",
    ]);
  });

  it("matches the seeded golden report on zone and the set of panels with dates", async () => {
    const { app } = scenario("franklin-golden");

    const res = await request(app).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(200);
    const live = floodEvidence(checkOf(res.body as ParcelReport, "flood"));
    const seeded = floodEvidence(checkOf(goldenReport, "flood"));
    expect(live).toEqual(seeded);
    // Both panels, so dropping either one on either side fails above.
    expect(seeded).toEqual({
      status: "evidenceFound",
      zones: ["X: area of minimal flood hazard"],
      panels: ["39049C0290K@2008-06-17", "39097C0190E@2023-11-16"],
    });
  });

  it("compares flood checks on zone and the set of panels, not wording or order", () => {
    const base: Check = {
      kind: "flood",
      status: "evidenceFound",
      finding:
        "FEMA's National Flood Hazard Layer maps the whole parcel in Zone X, area of minimal flood hazard.",
      limitation: "",
      sources: [
        {
          authority: "FEMA",
          title: "FIRM panel 39097C0190E (Madison County)",
          url: "",
          retrievedAt: "",
          effectiveDate: "2023-11-16",
        },
        {
          authority: "FEMA",
          title: "FIRM panel 39049C0290K (Franklin County)",
          url: "",
          retrievedAt: "",
          effectiveDate: "2008-06-17",
        },
      ],
      responsibleParty: { role: "" },
      nextAction: "",
    };
    const live = load("franklin-golden").apiResponse.body as ParcelReport;
    expect(floodEvidence(base)).toEqual(floodEvidence(checkOf(live, "flood")));

    // A missing panel, a different date, or a different zone all differ.
    const onePanel = { ...base, sources: base.sources.slice(1) };
    const redated = {
      ...base,
      sources: [
        { ...base.sources[0]!, effectiveDate: "2008-06-17" },
        base.sources[1]!,
      ],
    };
    const otherZone = { ...base, finding: "The lot is in Zone AE." };
    for (const changed of [onePanel, redated, otherZone]) {
      expect(floodEvidence(changed)).not.toEqual(floodEvidence(base));
    }
  });
});

describe("a slow or failed FEMA never breaks the report", () => {
  /** FEMA that never answers until the request is aborted. */
  const hangingFema = vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );

  it("returns 200 with flood unknown and every other check unchanged on a forced timeout", async () => {
    const baseline = load("franklin-outside").apiResponse.body as ParcelReport;
    const { app, fetchImpl, store } = scenario("franklin-outside", {
      femaFetch: hangingFema,
      floodTimeoutMs: 200,
    });

    const started = Date.now();
    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-outside"]),
    );

    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2_000);
    const report = res.body as ParcelReport;
    expect(checkOf(report, "flood")).toEqual({
      kind: "flood",
      status: "unknown",
      finding:
        "FEMA's flood map service did not answer within 0.2 seconds, so no flood zone was checked.",
      limitation: "No conclusion either way about flood risk.",
      sources: [],
      responsibleParty: {
        role: "FEMA flood map",
        organization: "FEMA Flood Map Service Center",
        publicContactUrl: "https://msc.fema.gov/portal/home",
      },
      nextAction:
        "Reload the report to ask FEMA again, or look the lot up on FEMA's Flood Map Service Center.",
    });
    expect(report.checks.filter((c) => c.kind !== "flood")).toEqual(
      baseline.checks.filter((c) => c.kind !== "flood"),
    );
    // The county's access evidence still stands without FEMA.
    expect(report.coverage).toBe("partial");
    expect(report.biggestOpenQuestion).toBe("septic");
    expect(hangingFema).toHaveBeenCalled();
    expect(fetchImpl.mock.calls.some(([input]) => isFema(input))).toBe(false);
    // A timed-out report is not cached, so the next request asks FEMA again.
    expect(store.write).not.toHaveBeenCalled();
  });

  it("reports FEMA as unreachable when it answers with an HTTP error", async () => {
    const { app } = scenario("franklin-outside", {
      femaFetch: async () => new Response("down", { status: 503 }),
    });

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-outside"]),
    );

    expect(res.status).toBe(200);
    const flood = checkOf(res.body as ParcelReport, "flood");
    expect(flood.status).toBe("unknown");
    expect(flood.finding).toBe(
      "FEMA's flood map service could not be reached, so no flood zone was checked.",
    );
  });

  it("reports an ArcGIS error body as unreachable, not as no data", async () => {
    const { app } = scenario("franklin-outside", {
      femaFetch: async () =>
        new Response(JSON.stringify({ error: { code: 400, message: "" } })),
    });

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-outside"]),
    );

    const flood = checkOf(res.body as ParcelReport, "flood");
    expect(flood.status).toBe("unknown");
    expect(flood.finding).toContain("could not be reached");
  });

  it("retries one dropped FEMA connection", async () => {
    const recording = load("franklin-outside");
    const recorded = replay(recording);
    let resets = 0;
    const flaky = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/28/query") && resets === 0) {
        resets += 1;
        throw new TypeError("fetch failed", {
          cause: { code: "ECONNRESET" },
        });
      }
      return recorded(input, init);
    });
    const app = appWith({
      fetch: recorded,
      femaFetch: flaky,
      at: new Date(recording.recordedAt),
    });

    const res = await request(app).get(reportPath(recording.parcelKey));

    expect(resets).toBe(1);
    expect(res.body).toEqual(recording.apiResponse.body);
  });
});

describe("a slow USDA soils check never breaks the report", () => {
  it("has its own timeout, leaves every other check unchanged, and is not cached", async () => {
    const baseline = load("franklin-outside").apiResponse.body as ParcelReport;
    const hangingSoils = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const { app, store } = scenario("franklin-outside", {
      soilsFetch: hangingSoils,
      soilsTimeoutMs: 200,
    });

    const started = Date.now();
    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-outside"]),
    );

    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2_000);
    const report = res.body as ParcelReport;
    expect(checkOf(report, "septic")).toMatchObject({
      kind: "septic",
      status: "unknown",
      finding:
        "USDA NRCS Soil Data Access did not answer within 0.2 seconds, so soil map units and septic ratings were not checked.",
      sources: [],
      responsibleParty: {
        role: "Local health district (sewage treatment systems)",
        organization: "Franklin County or city health district",
      },
    });
    expect(checkOf(report, "septic").nextAction).toContain(
      "site and soil evaluation",
    );
    expect(report.checks.filter((c) => c.kind !== "septic")).toEqual(
      baseline.checks.filter((c) => c.kind !== "septic"),
    );
    expect(hangingSoils).toHaveBeenCalledTimes(1);
    expect(store.write).not.toHaveBeenCalled();
  });
});

describe("report route errors", () => {
  it.each([
    ["no ohio prefix", "39049:230-000918"],
    ["short county code", "ohio:3904:230-000918"],
    ["empty parcel id", "ohio:39049:"],
    ["path characters", "ohio:39049:../etc"],
    ["leading punctuation", "ohio:39049:-DEMO"],
  ])("rejects a malformed key (%s) without any lookup", async (_label, key) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const store = memoryStore();
    const res = await request(
      appWith({ fetch: fetchImpl, at: new Date(), store }),
    ).get(reportPath(key));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(store.read).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 404 for a parcel key OGRIP does not publish, without asking FEMA", async () => {
    const { app, fetchImpl, recording } = scenario("missing-parcel");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["missing-parcel"]),
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Ohio's parcel map has no parcel 999-999999 in Franklin County.",
      retryable: false,
    });
    expect(res.body).toEqual({
      error: {
        ...(recording.apiResponse.body as { error: object }).error,
        requestId: res.headers["x-request-id"],
      },
    });
    expect(fetchImpl.mock.calls.some(([input]) => isFema(input))).toBe(false);
  });

  it("returns 404 NO_COVERAGE for a county code outside Ohio", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await request(
      appWith({ fetch: fetchImpl, at: new Date() }),
    ).get(reportPath("ohio:06037:1234"));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_COVERAGE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a retryable 504 when OGRIP times out, with no guessed report", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hanging = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const app = createApp("test-commit", {
      ogrip: createOgripClient({ fetch: hanging, timeoutMs: 50 }),
      report: {
        fema: createFemaFloodClient({ fetch: hanging }),
        access: createFranklinAccessClient({ fetch: hanging }),
        store: memoryStore(),
      },
    });

    const res = await request(app).get(reportPath("ohio:39049:010-042534"));

    expect(res.status).toBe(504);
    expect(res.body.error).toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
    expect(String(hanging.mock.calls[0]?.[0])).toContain(OGRIP_PARCELS_LAYER);
  });
});

describe("stored reports", () => {
  it("serves the seeded golden report without calling OGRIP or FEMA", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const store = memoryStore([goldenReport]);

    const res = await request(
      appWith({ fetch: fetchImpl, at: new Date(), store }),
    ).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(goldenReport);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stores a complete live report for 24 hours and serves it from the store", async () => {
    const store = memoryStore();
    const { app, fetchImpl, recording } = scenario("franklin-outside", {
      store,
    });
    const path = reportPath(recording.parcelKey);

    const first = await request(app).get(path);
    await vi.waitFor(() => expect(store.write).toHaveBeenCalledTimes(1));
    const [parcel, report, expiresAt] = store.write.mock.calls[0] ?? [];
    expect((parcel as Parcel).key).toBe(recording.parcelKey);
    expect(report).toEqual(first.body);
    expect((expiresAt as Date).getTime()).toBe(
      new Date(recording.recordedAt).getTime() + LIVE_REPORT_TTL_MS,
    );

    const calls = fetchImpl.mock.calls.length;
    const second = await request(app).get(path);
    expect(second.body).toEqual(first.body);
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it("still serves a live report when the database is down, and does not try to store it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = memoryStore();
    store.read.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { app, recording } = scenario("franklin-outside", { store });

    const res = await request(app).get(reportPath(recording.parcelKey));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(recording.apiResponse.body);
    expect(store.write).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("does not let a failed cache write change the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = memoryStore();
    store.write.mockRejectedValue(new Error("disk full"));
    const { app, recording } = scenario("franklin-outside", { store });

    const res = await request(app).get(reportPath(recording.parcelKey));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(recording.apiResponse.body);
  });
});

describe("Prisma report store behind the route", () => {
  const findUnique = vi.fn();
  const prisma = { reportRecord: { findUnique } } as unknown as PrismaClient;
  const notInOgrip = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] })),
  );
  const app = () =>
    appWith({
      fetch: notInOgrip,
      at: new Date("2026-11-16T12:00:00.000Z"),
      store: prismaReportStore(prisma),
    });

  const storedCheck = (overrides: Record<string, unknown> = {}) => ({
    position: 0,
    kind: "access",
    status: "unknown",
    finding: "No record establishes legal road access.",
    limitation: "A boundary touching a road does not prove access rights.",
    nextAction: "Ask the title team to check recorded access.",
    responsibleRole: "Title reviewer",
    responsibleOrganization: null,
    publicContactUrl: null,
    reviewerWallet: null,
    transactionSignature: null,
    sources: [],
    ...overrides,
  });
  const storedReport = (overrides: Record<string, unknown> = {}) => ({
    parcelKey: goldenParcel.key,
    generatedAt: new Date("2026-11-13T12:00:00.000Z"),
    coverage: "partial",
    biggestOpenQuestion: "access",
    expiresAt: null,
    checks: [],
    ...overrides,
  });

  afterEach(() => {
    findUnique.mockReset();
  });

  it("maps a stored report to the v1 ParcelReport in position order", async () => {
    findUnique.mockResolvedValue(
      storedReport({
        checks: [
          storedCheck({
            position: 1,
            kind: "flood",
            status: "evidenceFound",
            finding: "Mapped outside the special flood hazard area.",
            responsibleOrganization: "FEMA",
            sources: [
              {
                position: 0,
                authority: "FEMA",
                title: "National Flood Hazard Layer",
                url: "https://msc.fema.gov/portal/home",
                retrievedAt: new Date("2026-11-12T09:30:00.000Z"),
                effectiveDate: new Date("2008-06-17T00:00:00.000Z"),
              },
            ],
          }),
          storedCheck({ position: 0 }),
        ],
      }),
    );

    const res = await request(app()).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(200);
    expect(res.body.checks.map((c: Check) => c.kind)).toEqual([
      "access",
      "flood",
    ]);
    expect(res.body.checks[1].sources).toEqual([
      {
        authority: "FEMA",
        title: "National Flood Hazard Layer",
        url: "https://msc.fema.gov/portal/home",
        retrievedAt: "2026-11-12T09:30:00.000Z",
        effectiveDate: "2008-06-17",
      },
    ]);
    expect(notInOgrip).not.toHaveBeenCalled();
  });

  it("ignores an expired live copy and looks the parcel up again", async () => {
    findUnique.mockResolvedValue(
      storedReport({ expiresAt: new Date("2026-11-16T11:59:59.000Z") }),
    );

    const res = await request(app()).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(404);
    expect(notInOgrip).toHaveBeenCalledTimes(1);
  });

  it("refuses to serve a stored finding that has no source", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockResolvedValue(
      storedReport({
        checks: [storedCheck({ status: "evidenceFound", sources: [] })],
      }),
    );

    const res = await request(app()).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("refuses to serve stored values outside the contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockResolvedValue(storedReport({ coverage: "statewide" }));

    const res = await request(app()).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(500);
  });

  it("hides database failure details from the response and the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockRejectedValue(
      new Error("connect ECONNREFUSED postgresql://admin:hunter2@db:5432"),
    );

    const res = await request(app()).get(reportPath(goldenParcel.key));

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      requestId: res.headers["x-request-id"],
      retryable: true,
    });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    for (const [line] of log.mock.calls) {
      expect(String(line)).not.toContain("hunter2");
    }
  });
});

describe("Franklin County zoning, live from the county map", () => {
  it("matches the seeded golden report for 230-000918: district R, the whole parcel", async () => {
    const { app, recording } = scenario("franklin-golden");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-golden"]),
    );

    expect(res.status).toBe(200);
    const live = checkOf(res.body as ParcelReport, "zoning");
    const seeded = checkOf(goldenReport, "zoning");
    expect(live.status).toBe(seeded.status);
    expect(live.status).toBe("evidenceFound");
    expect(live.finding).toBe(
      "Franklin County's zoning map places the whole parcel in the Rural District (R).",
    );
    expect(seeded.finding).toContain(
      "places the whole parcel in the Rural (R) district",
    );

    // The measured shares behind it: R alone, 100%, nothing uncovered.
    const exchange = recording.exchanges.find((e) =>
      e.url.startsWith(FCEDP_ZONING_LAYER),
    );
    const parcel = recording.exchanges.find((e) =>
      e.url.includes("OhioStatewidePacels"),
    );
    const geometry = (
      parcel?.body as {
        features: { geometry: Parameters<typeof measure>[0] }[];
      }
    ).features[0]?.geometry;
    if (!exchange || !geometry) throw new Error("recording incomplete");
    expect(
      measure(
        geometry,
        (exchange.body as { features: Parameters<typeof measure>[1] }).features,
        recording.recordedAt,
      ),
    ).toEqual({
      outcome: "found",
      retrievedAt: recording.recordedAt,
      districts: [{ code: "R", className: "Rural District", share: 1 }],
      uncovered: 0,
      contradicted: 0,
    });

    // Sources: the layer, retrieved now, and the Zoning Resolution, as read.
    expect(live.sources).toEqual([
      {
        authority: "Franklin County Economic Development & Planning",
        title: "FCEDP Zoning Districts 2025: districts under the parcel",
        url: FCEDP_ZONING_LAYER,
        retrievedAt: recording.recordedAt,
      },
      {
        authority: "Franklin County Economic Development & Planning",
        title: "Franklin County Zoning Resolution 2026",
        url: "https://www.franklincountyohio.gov/files/assets/public/v/1/edp/documents/zoning-resolution/zoning-resolution-2026.pdf",
        retrievedAt: "2026-11-17T00:54:52.000Z",
      },
    ]);
    expect(live.limitation).toMatch(
      /does not say what this lot may be used for/,
    );
  });

  it("asks for review when two districts meaningfully cover the parcel", async () => {
    const { app } = scenario("franklin-split");

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-split"]),
    );

    expect(res.status).toBe(200);
    const zoning = checkOf(res.body as ParcelReport, "zoning");
    expect(zoning.status).toBe("needsReview");
    expect(zoning.finding).toBe(
      "Franklin County's zoning map splits this parcel: about 53% in the Rural District (R) and about 47% in the Neighborhood Commercial District (NC).",
    );
    expect(zoning.nextAction).toMatch(/how the district lines apply/);
  });

  it("keeps the report at 200 with zoning unknown when the county map times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const baseline = load("franklin-golden").apiResponse.body as ParcelReport;
    const hanging = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const { app, store } = scenario("franklin-golden", {
      zoningFetch: hanging,
      zoningTimeoutMs: 200,
    });

    const started = Date.now();
    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-golden"]),
    );

    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2_000);
    const report = res.body as ParcelReport;
    expect(checkOf(report, "zoning")).toMatchObject({
      status: "unknown",
      finding:
        "Franklin County's zoning map did not answer within 0.2 seconds, so no zoning district was checked.",
      sources: [],
    });
    expect(report.checks.filter((c) => c.kind !== "zoning")).toEqual(
      baseline.checks.filter((c) => c.kind !== "zoning"),
    );
    expect(hanging).toHaveBeenCalled();
    // A timed-out report is not cached, so the next request asks again.
    expect(store.write).not.toHaveBeenCalled();
  });

  it("says the county map could not be reached when it errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = scenario("franklin-golden", {
      zoningFetch: async () =>
        new Response(JSON.stringify({ error: { code: 500, message: "x" } })),
    });

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["franklin-golden"]),
    );

    expect(res.status).toBe(200);
    expect(checkOf(res.body as ParcelReport, "zoning")).toMatchObject({
      status: "unknown",
      finding:
        "Franklin County's zoning map could not be reached, so no zoning district was checked.",
    });
  });

  it("does not ask Franklin County's map about a parcel in another county", async () => {
    const zoningFetch = vi.fn<typeof fetch>();
    const { app } = scenario("licking-outside", { zoningFetch });

    const res = await request(app).get(
      reportPath(REPORT_SCENARIOS["licking-outside"]),
    );

    expect(res.status).toBe(200);
    expect(zoningFetch).not.toHaveBeenCalled();
    expect(checkOf(res.body as ParcelReport, "zoning").finding).toBe(
      "No zoning record has been checked for this lot yet.",
    );
  });
});

describe("Franklin County zoning queries", () => {
  it("only counts NOT IN JURISDICTION areas when no named district covers the lot", () => {
    const zoningRequests = load("franklin-outside").exchanges.filter((e) =>
      e.url.startsWith(FCEDP_ZONING_LAYER),
    );
    const excluded = zoningRequests
      .map((e) => new URLSearchParams(e.requestBody))
      .filter((p) => p.get("where")?.startsWith("ZONING LIKE"));
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.get("returnCountOnly")).toBe("true");
    expect(excluded[0]?.get("returnGeometry")).toBeNull();
    for (const request of zoningRequests) {
      const params = new URLSearchParams(request.requestBody);
      expect(params.get("spatialRel")).toBe("esriSpatialRelRelation");
      expect(params.get("relationParam")).toBe("T********");
    }
  });
});

describe("Franklin County road access, live from the county right-of-way and road layers", () => {
  const RECORDER = {
    organization: "Franklin County Recorder",
    publicContactUrl:
      "https://www.franklincountyohio.gov/Agency-Directory/Recorder/Real-Estate/Recording-FAQs",
  };

  async function accessOf(name: ReportScenario, overrides = {}) {
    const { app, recording, store } = scenario(name, overrides);
    const res = await request(app).get(reportPath(REPORT_SCENARIOS[name]));
    expect(res.status).toBe(200);
    const report = res.body as ParcelReport;
    return { report, access: checkOf(report, "access"), recording, store };
  }

  it("names the right-of-way a city lot touches: 84 W Dodridge St, a corner on Neil Ave", async () => {
    const { report, access, recording } = await accessOf("franklin-outside");

    expect(report).toEqual(recording.apiResponse.body);
    expect(access).toEqual({
      kind: "access",
      status: "evidenceFound",
      finding:
        "This parcel touches the public right-of-way of W Dodridge St and Neil Ave in Franklin County's right-of-way layer. In the county engineer's road layer, the W Dodridge St centerline is about 9 m (28 ft) from the parcel.",
      limitation:
        "Touching a mapped right-of-way is not legal access. These layers do not show whether the lot has a recorded right to use the road, whether the road is built and maintained where the lot meets it, or whether a driveway would be permitted there.",
      sources: [
        {
          authority: "Franklin County",
          title:
            "Tax parcel right-of-way layer: public road right-of-way within 1 m of the parcel",
          url: FRANKLIN_ROW_LAYER,
          retrievedAt: recording.recordedAt,
        },
        {
          authority: "Franklin County Engineer",
          title:
            "Public road sections: W Dodridge St centerline about 9 m (28 ft) from the parcel",
          url: FCEO_ROAD_LAYER,
          retrievedAt: recording.recordedAt,
        },
      ],
      responsibleParty: {
        role: "Title reviewer, then the road authority",
        ...RECORDER,
      },
      nextAction:
        "Ask a title company to confirm the lot's recorded right to reach W Dodridge St, and ask the road authority (Columbus, per the county road layer) what a driveway permit needs.",
    });
  });

  it("says when a rural lot runs to the road's centerline (Harrisburg Pike)", async () => {
    const { access } = await accessOf("franklin-split");

    expect(access.status).toBe("evidenceFound");
    expect(access.finding).toBe(
      "This parcel touches the public right-of-way of Harrisburg Pike in Franklin County's right-of-way layer. In the county engineer's road layer, the Harrisburg Pike centerline meets the parcel boundary.",
    );
    expect(access.nextAction).toContain(
      "(Pleasant Twp, per the county road layer)",
    );
  });

  it("lists every road whose right-of-way the lot touches (0 Groveport Rd)", async () => {
    const { access } = await accessOf("franklin-crossing");

    expect(access.status).toBe("evidenceFound");
    expect(access.finding).toMatch(
      /^This parcel touches the public right-of-way of Old Rathmell Ct and Samson Frontage Rd /,
    );
  });

  it("needs review when the touching right-of-way has no road through it, and flags a nearby interstate", async () => {
    const { access } = await accessOf("franklin-floodway");

    expect(access.status).toBe("needsReview");
    expect(access.finding).toBe(
      "A public road right-of-way (recorded as \"Highway\") touches this parcel in Franklin County's right-of-way layer, but the county engineer's road layer shows no road centerline running through it beside the parcel. It may be land set aside for a road that was never built, or the edge of a wider road corridor. The nearest mapped road, I-270, is about 43 m (141 ft) away. The road layer lists it in the federal highway system (interstates and expressways), and those are usually limited-access, with no driveways.",
    );
    expect(access.responsibleParty).toEqual({
      role: "Title reviewer, then surveyor",
      ...RECORDER,
    });
  });

  it("agrees with the seeded golden report: no right-of-way touches 230-000918, Seaman Rd about 106 m away", async () => {
    const { access, report, recording } = await accessOf("franklin-golden");

    expect(access).toEqual({
      kind: "access",
      status: "needsReview",
      finding:
        "No public road right-of-way touches this parcel in Franklin County's right-of-way layer. The nearest mapped road, Seaman Rd, is about 106 m (347 ft) away in the county engineer's road layer.",
      limitation:
        "These layers show mapped right-of-way and road centerlines. They do not show recorded easements, private lanes, or other legal access, so they cannot establish whether the parcel has access.",
      sources: [
        {
          authority: "Franklin County",
          title:
            "Tax parcel right-of-way layer: no public road right-of-way touches the parcel",
          url: FRANKLIN_ROW_LAYER,
          retrievedAt: recording.recordedAt,
        },
        {
          authority: "Franklin County Engineer",
          title:
            "Public road sections: nearest road Seaman Rd, about 106 m (347 ft)",
          url: FCEO_ROAD_LAYER,
          retrievedAt: recording.recordedAt,
        },
      ],
      responsibleParty: { role: "Title reviewer, then surveyor", ...RECORDER },
      nextAction:
        "Ask a title company to search for recorded legal access to Seaman Rd or another public road, such as an easement across a neighboring lot, and have a surveyor show where it runs.",
    });
    expect(report.biggestOpenQuestion).toBe("access");

    // Same status, layers, and road as the hand-verified golden check. The
    // golden card rounds to 107 m; QA measured 105.75 m (DemoScript-Parcel).
    const seeded = checkOf(goldenReport, "access");
    expect(seeded.status).toBe(access.status);
    expect(seeded.finding).toContain(
      "No road right-of-way touches this parcel",
    );
    expect(seeded.finding).toContain("Seaman Rd");
    expect(seeded.sources.map((s) => s.url)).toEqual(
      expect.arrayContaining(access.sources.map((s) => s.url)),
    );
  });

  it("leaves the seeded golden report exactly as verified", async () => {
    const accessFetch = vi.fn<typeof fetch>();
    const soilsFetch = vi.fn<typeof fetch>();
    const res = await request(
      appWith({
        fetch: vi.fn<typeof fetch>(),
        accessFetch,
        soilsFetch,
        at: new Date(),
        store: memoryStore([goldenReport]),
      }),
    ).get(reportPath(goldenParcel.key));

    expect(res.body).toEqual(goldenReport);
    expect(accessFetch).not.toHaveBeenCalled();
    expect(soilsFetch).not.toHaveBeenCalled();
    expect(checkOf(res.body as ParcelReport, "access").finding).toBe(
      "No road right-of-way touches this parcel in Franklin County's right-of-way layer. The nearest mapped road, Seaman Rd, is about 107 m away in the county engineer's road layer. The Franklin County Auditor lists the parcel as \"SEAMAN RD REAR\".",
    );
  });

  it("keeps the report at 200 with access unknown when the county layers time out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const baseline = load("franklin-outside").apiResponse.body as ParcelReport;
    const hanging = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const started = Date.now();
    const { report, access, store } = await accessOf("franklin-outside", {
      accessFetch: hanging,
      accessTimeoutMs: 200,
    });

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(access).toEqual({
      kind: "access",
      status: "unknown",
      finding:
        "Franklin County's road maps did not answer within 0.2 seconds, so road access was not checked.",
      limitation: "No access conclusion either way.",
      sources: [],
      responsibleParty: { role: "Title reviewer, then surveyor", ...RECORDER },
      nextAction:
        "Reload the report to ask the county maps again, or ask a title company to search recorded access rights.",
    });
    expect(report.checks.filter((c) => c.kind !== "access")).toEqual(
      baseline.checks.filter((c) => c.kind !== "access"),
    );
    expect(report.biggestOpenQuestion).toBe("access");
    expect(hanging).toHaveBeenCalled();
    // A timed-out report is not cached, so the next request asks again.
    expect(store.write).not.toHaveBeenCalled();
  });

  it("says the county layers could not be reached when one answers with an ArcGIS error", async () => {
    const recording = load("franklin-outside");
    const replayed = replay(recording);
    const { access } = await accessOf("franklin-outside", {
      accessFetch: vi.fn<typeof fetch>(async (input, init) =>
        String(input).startsWith(FCEO_ROAD_LAYER)
          ? new Response(JSON.stringify({ error: { code: 500, message: "x" } }))
          : replayed(input, init),
      ),
    });

    expect(access.status).toBe("unknown");
    expect(access.finding).toBe(
      "Franklin County's road maps could not be reached, so road access was not checked.",
    );
  });

  it("does not ask Franklin County's layers about a parcel in another county", async () => {
    const accessFetch = vi.fn<typeof fetch>();
    const { access } = await accessOf("licking-outside", { accessFetch });

    expect(accessFetch).not.toHaveBeenCalled();
    expect(access.status).toBe("unknown");
    expect(access.finding).toBe(
      "No record of legal road access has been checked for this lot.",
    );
  });

  it("queries public road right-of-way within 1 m, and roads within 200 m before widening", () => {
    for (const name of [
      "franklin-outside",
      "franklin-golden",
      "franklin-split",
    ] as const) {
      const exchanges = load(name).exchanges;
      const row = exchanges
        .filter((e) => e.url === `${FRANKLIN_ROW_LAYER}/query`)
        .map((e) => new URLSearchParams(e.requestBody));
      const roads = exchanges
        .filter((e) => e.url === `${FCEO_ROAD_LAYER}/query`)
        .map((e) => new URLSearchParams(e.requestBody));
      expect(row).toHaveLength(1);
      expect(row[0]?.get("where")).toContain("'Plat - R/W'");
      expect(row[0]?.get("where")).not.toContain("Historic");
      expect(row[0]?.get("distance")).toBe("1");
      expect(row[0]?.get("units")).toBe("esriSRUnit_Meter");
      // Each recorded lot has a road within 200 m, so no wider search ran.
      expect(roads.map((p) => p.get("distance"))).toEqual(["200"]);
      expect(roads[0]?.get("where")).toBe(
        "RoadClass IS NULL OR RoadClass NOT IN ('Private','Ramp')",
      );
    }
  });
});
