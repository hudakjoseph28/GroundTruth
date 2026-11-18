import { readFileSync } from "node:fs";
import { goldenParcel, type ParcelReport } from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import { septicCheck } from "../src/reports/septicCheck.js";
import {
  createSsurgoSoilsClient,
  SDA_POST_REST,
} from "../src/reports/ssurgoSoils.js";

interface SdaFixture {
  recordedAt: string;
  response: { status: number; body: unknown };
}

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/ssurgo/septic-map-units.json", import.meta.url),
    "utf8",
  ),
) as SdaFixture;

describe("USDA NRCS Soil Data Access septic ratings", () => {
  it("replays the saved SDA response shape and computes each map unit's parcel share", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(fixture.response.body, { status: fixture.response.status }),
    );
    const client = createSsurgoSoilsClient({
      fetch: fetchImpl,
      now: () => new Date(fixture.recordedAt),
    });

    const outcome = await client.septicSuitability(
      goldenParcel.geometry.geojson,
      new AbortController().signal,
    );

    expect(outcome).toEqual({
      outcome: "found",
      retrievedAt: fixture.recordedAt,
      mapUnits: [
        {
          mukey: "test-101",
          symbol: "Ko",
          name: "Kokomo silty clay loam",
          rating: "Very limited",
          share: 0.725,
        },
        {
          mukey: "test-102",
          symbol: "CrB",
          name: "Crosby silt loam",
          rating: "Somewhat limited",
          share: 0.225,
        },
        {
          mukey: "test-103",
          symbol: "Bs",
          name: "Brookston silty clay loam",
          rating: "Not limited",
          share: 0.05,
        },
      ],
    });
    expect(
      outcome.outcome === "found"
        ? outcome.mapUnits.reduce((sum, unit) => sum + unit.share, 0)
        : 0,
    ).toBeCloseTo(1);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(SDA_POST_REST);
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("format")).toBe("JSON+COLUMNNAME");
    expect(form.get("query")).toContain(
      "SDA_Get_Mukey_from_intersection_with_WktWgs84",
    );
    expect(form.get("query")).toContain("a.engstafdcd");
    expect(form.get("query")).toContain("STIntersection");
    expect(form.get("query")).toContain("POLYGON((");
  });

  it("turns the ratings into needsReview with a dated SSURGO source and required next action", async () => {
    const client = createSsurgoSoilsClient({
      fetch: async () => Response.json(fixture.response.body),
      now: () => new Date(fixture.recordedAt),
    });
    const outcome = await client.septicSuitability(
      goldenParcel.geometry.geojson,
      new AbortController().signal,
    );

    const check = septicCheck(goldenParcel, outcome, 6_000);

    expect(check).toMatchObject({
      kind: "septic",
      status: "needsReview",
      sources: [
        {
          authority: "USDA Natural Resources Conservation Service",
          url: SDA_POST_REST,
          retrievedAt: fixture.recordedAt,
        },
      ],
      responsibleParty: {
        role: "Local health district (sewage treatment systems)",
        organization: "Franklin County or city health district",
      },
    });
    expect(check.finding).toContain("72.5% of the parcel");
    expect(check.finding).toContain("Very limited");
    expect(check.finding).toContain("Somewhat limited");
    expect(check.finding).toContain("Not limited");
    expect(check.finding.toLowerCase()).not.toMatch(/septic\s+will\s+work/);
    expect(check.nextAction).toContain(
      "Ohio Department of Health homeowner page",
    );
    expect(check.nextAction).toContain("site and soil evaluation");
  });

  it("keeps missing, unrated, malformed, and recorded HTTP failures unknown", async () => {
    const outage = JSON.parse(
      readFileSync(
        new URL("./fixtures/ssurgo/sda-502-2026-11-18.json", import.meta.url),
        "utf8",
      ),
    ) as SdaFixture;
    const answers = [
      Response.json({
        Table: [["mukey", "musym", "muname", "engstafdcd", "overlap_area"]],
      }),
      Response.json({
        Table: [
          ["mukey", "musym", "muname", "engstafdcd", "overlap_area"],
          ["test", "X", "Unrated test soil", "Not rated", 1],
        ],
      }),
      Response.json({ nope: true }),
      new Response(String(outage.response.body), {
        status: outage.response.status,
      }),
    ];

    for (const answer of answers) {
      const client = createSsurgoSoilsClient({
        fetch: async () => answer,
        now: () => new Date(fixture.recordedAt),
      });
      const outcome = await client.septicSuitability(
        goldenParcel.geometry.geojson,
        new AbortController().signal,
      );
      const report = {
        checks: [septicCheck(goldenParcel, outcome, 6_000)],
      } as Pick<ParcelReport, "checks">;

      expect(report.checks[0]?.status).toBe("unknown");
      expect(report.checks[0]?.nextAction).toContain(
        "site and soil evaluation",
      );
    }
  });
});
