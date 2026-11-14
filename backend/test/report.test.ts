import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("../src/db.js", () => ({
  prisma: { parcelRecord: { findUnique } },
}));

const { createApp } = await import("../src/app.js");
const app = createApp("test-commit");

const PARCEL_KEY = "ohio:39049:STAGED-DEMO";
const reportUrl = (key: string) =>
  `/api/parcels/${encodeURIComponent(key)}/report`;

const generatedAt = new Date("2026-11-13T12:00:00.000Z");
const retrievedAt = new Date("2026-11-12T09:30:00.000Z");

function storedCheck(overrides: Record<string, unknown> = {}) {
  return {
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
  };
}

function storedParcel(report: Record<string, unknown> | null) {
  return { key: PARCEL_KEY, report };
}

function storedReport(overrides: Record<string, unknown> = {}) {
  return {
    parcelKey: PARCEL_KEY,
    generatedAt,
    coverage: "partial",
    biggestOpenQuestion: "access",
    checks: [],
    ...overrides,
  };
}

afterEach(() => {
  findUnique.mockReset();
  vi.restoreAllMocks();
});

describe("GET /api/parcels/:parcelKey/report", () => {
  it.each([
    ["no ohio prefix", "39049:STAGED-DEMO"],
    ["short county code", "ohio:3904:STAGED-DEMO"],
    ["empty parcel id", "ohio:39049:"],
    ["path characters", "ohio:39049:../etc"],
    ["leading punctuation", "ohio:39049:-DEMO"],
  ])("rejects a malformed key (%s) without querying", async (_label, key) => {
    const res = await request(app).get(reportUrl(key));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(res.body.error.retryable).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the parcel is not recorded", async () => {
    findUnique.mockResolvedValue(null);

    const res = await request(app).get(reportUrl(PARCEL_KEY));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "No parcel is recorded for this key.",
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: PARCEL_KEY } }),
    );
  });

  it("returns 404 when the parcel has no report", async () => {
    findUnique.mockResolvedValue(storedParcel(null));

    const res = await request(app).get(reportUrl(PARCEL_KEY));

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe(
      "No report is recorded for this parcel.",
    );
  });

  it("maps a stored report to the v1 ParcelReport in position order", async () => {
    findUnique.mockResolvedValue(
      storedParcel(
        storedReport({
          checks: [
            storedCheck({
              position: 1,
              kind: "flood",
              status: "evidenceFound",
              finding: "Mapped outside the special flood hazard area.",
              responsibleOrganization: "FEMA",
              publicContactUrl: "https://msc.fema.gov/portal/home",
              sources: [
                {
                  position: 0,
                  authority: "FEMA",
                  title: "National Flood Hazard Layer",
                  url: "https://msc.fema.gov/portal/home",
                  retrievedAt,
                  effectiveDate: null,
                },
              ],
            }),
            storedCheck({ position: 0 }),
          ],
        }),
      ),
    );

    const res = await request(app).get(reportUrl(PARCEL_KEY));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      parcelKey: PARCEL_KEY,
      generatedAt: "2026-11-13T12:00:00.000Z",
      coverage: "partial",
      biggestOpenQuestion: "access",
      checks: [
        {
          kind: "access",
          status: "unknown",
          finding: "No record establishes legal road access.",
          limitation:
            "A boundary touching a road does not prove access rights.",
          sources: [],
          responsibleParty: { role: "Title reviewer" },
          nextAction: "Ask the title team to check recorded access.",
        },
        {
          kind: "flood",
          status: "evidenceFound",
          finding: "Mapped outside the special flood hazard area.",
          limitation:
            "A boundary touching a road does not prove access rights.",
          sources: [
            {
              authority: "FEMA",
              title: "National Flood Hazard Layer",
              url: "https://msc.fema.gov/portal/home",
              retrievedAt: "2026-11-12T09:30:00.000Z",
            },
          ],
          responsibleParty: {
            role: "Title reviewer",
            organization: "FEMA",
            publicContactUrl: "https://msc.fema.gov/portal/home",
          },
          nextAction: "Ask the title team to check recorded access.",
        },
      ],
    });
  });

  it("refuses to serve a finding that has no source", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockResolvedValue(
      storedParcel(
        storedReport({
          checks: [storedCheck({ status: "evidenceFound", sources: [] })],
        }),
      ),
    );

    const res = await request(app).get(reportUrl(PARCEL_KEY));

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("refuses to serve stored values outside the contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockResolvedValue(
      storedParcel(storedReport({ coverage: "statewide" })),
    );

    const res = await request(app).get(reportUrl(PARCEL_KEY));

    expect(res.status).toBe(500);
  });

  it("hides database failure details from the response and the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    findUnique.mockRejectedValue(
      new Error("connect ECONNREFUSED postgresql://admin:hunter2@db:5432"),
    );

    const res = await request(app).get(reportUrl(PARCEL_KEY));

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      requestId: res.headers["x-request-id"],
      retryable: true,
    });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).not.toContain("hunter2");
  });
});
