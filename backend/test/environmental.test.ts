import {
  goldenParcel,
  secondCountyParcel,
  type Check,
  type CheckKind,
  type CheckStatus,
  type GeoJsonPolygon,
} from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import { environmentalCheck } from "../src/reports/environmentalCheck.js";
import {
  createFranklinStreamBuffersClient,
  FRANKLIN_STREAM_BUFFERS_LAYER,
  measureSetbacks,
  type Outline,
} from "../src/reports/franklinStreamBuffers.js";
import {
  createNwiWetlandsClient,
  measureDrawing,
  NWI_IMAGE_YEAR_LAYER,
  NWI_WETLAND_TYPES,
  renderView,
  type WetlandsOutcome,
} from "../src/reports/nwiWetlands.js";
import {
  biggestOpenQuestion,
  buildReport,
  OPEN_QUESTION_PRIORITY,
} from "../src/reports/pipeline.js";
import { bounds } from "../src/reports/sampling.js";
import { templateCheck, TEMPLATE_KINDS } from "../src/reports/templates.js";

// A 0.001° square lot near Columbus (about 85 m × 111 m).
const X0 = -83.2;
const Y0 = 39.9;
const D = 0.001;
const lot: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [X0, Y0],
      [X0 + D, Y0],
      [X0 + D, Y0 + D],
      [X0, Y0 + D],
      [X0, Y0],
    ],
  ],
};

const ring = (x1: number, y1: number, x2: number, y2: number) => [
  [x1, y1],
  [x1, y2],
  [x2, y2],
  [x2, y1],
  [x1, y1],
];
const outline = (...rings: number[][][]): Outline => ({
  rings: rings.map((coords) => ({ coords, box: bounds(coords) })),
});

const AT = "2026-11-18T00:00:00.000Z";

describe("measureSetbacks", () => {
  it("measures half the lot inside a setback", () => {
    const result = measureSetbacks(lot, [
      {
        name: "Big Darby Creek Watershed Riparian Setbacks",
        outline: outline(ring(X0 - 1, Y0 - 1, X0 + D / 2, Y0 + 1)),
      },
    ]);
    expect(result.share).toBeCloseTo(0.5, 2);
    expect(result.setbacks).toEqual([
      {
        name: "Big Darby Creek Watershed Riparian Setbacks",
        share: result.share,
      },
    ]);
  });

  it("lists two setbacks largest first, and counts their union once", () => {
    const result = measureSetbacks(lot, [
      {
        name: "A",
        outline: outline(ring(X0 - 1, Y0 - 1, X0 + D * 0.25, Y0 + 1)),
      },
      {
        name: "B",
        outline: outline(ring(X0 - 1, Y0 - 1, X0 + D * 0.75, Y0 + 1)),
      },
    ]);
    expect(result.setbacks.map((s) => s.name)).toEqual(["B", "A"]);
    expect(result.setbacks[0]?.share).toBeCloseTo(0.75, 2);
    expect(result.setbacks[1]?.share).toBeCloseTo(0.25, 2);
    expect(result.share).toBeCloseTo(0.75, 2);
  });

  it("ignores rings far from the lot and cuts out holes", () => {
    const hole = [...ring(X0 + D / 2, Y0 - 1, X0 + 1, Y0 + 1)].reverse();
    const result = measureSetbacks(lot, [
      {
        name: "A",
        outline: outline(
          ring(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1),
          hole,
          ring(X0 + 5, Y0 + 5, X0 + 6, Y0 + 6),
        ),
      },
    ]);
    expect(result.share).toBeCloseTo(0.5, 2);
  });

  it("finds no setback when none covers the lot", () => {
    expect(
      measureSetbacks(lot, [
        { name: "A", outline: outline(ring(X0 + 1, Y0 + 1, X0 + 2, Y0 + 2)) },
      ]),
    ).toEqual({ setbacks: [], share: 0 });
  });
});

describe("Franklin stream-buffer client", () => {
  const overlapAnswer = {
    features: [
      {
        attributes: {
          OBJECTID: 2,
          Name: "Big Darby Creek Watershed Riparian Setbacks",
        },
      },
    ],
  };
  const outlineAnswer = {
    features: [
      {
        attributes: { OBJECTID: 2 },
        geometry: { rings: [ring(X0 - 1, Y0 - 1, X0 + D / 2, Y0 + 1)] },
      },
    ],
  };
  const isOutline = (init?: RequestInit) =>
    new URLSearchParams(String(init?.body)).has("objectIds");

  it("downloads a watershed's outline once and reuses it for the next lot", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(`${FRANKLIN_STREAM_BUFFERS_LAYER}/query`);
      return new Response(
        JSON.stringify(isOutline(init) ? outlineAnswer : overlapAnswer),
      );
    });
    const client = createFranklinStreamBuffersClient({
      fetch: fetchImpl,
      now: () => new Date(AT),
    });

    const first = await client.setbacks(lot, new AbortController().signal);
    const second = await client.setbacks(lot, new AbortController().signal);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ outcome: "found", retrievedAt: AT });
    expect(
      fetchImpl.mock.calls.filter(([, init]) => isOutline(init)),
    ).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not keep a failed outline download", async () => {
    let fail = true;
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      if (isOutline(init) && fail) return new Response("down", { status: 503 });
      return new Response(
        JSON.stringify(isOutline(init) ? outlineAnswer : overlapAnswer),
      );
    });
    const client = createFranklinStreamBuffersClient({ fetch: fetchImpl });

    expect(await client.setbacks(lot, new AbortController().signal)).toEqual({
      outcome: "timeout",
      cause: "unavailable",
    });
    fail = false;
    expect(
      await client.setbacks(lot, new AbortController().signal),
    ).toMatchObject({ outcome: "found" });
  });

  it("finishes an outline download for the next lot after a check stops waiting", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      if (isOutline(init)) await gate;
      return new Response(
        JSON.stringify(isOutline(init) ? outlineAnswer : overlapAnswer),
      );
    });
    const client = createFranklinStreamBuffersClient({ fetch: fetchImpl });
    const controller = new AbortController();

    const waiting = client.setbacks(lot, controller.signal);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    controller.abort();
    expect(await waiting).toEqual({ outcome: "timeout", cause: "timedOut" });

    release();
    expect(
      await client.setbacks(lot, new AbortController().signal),
    ).toMatchObject({ outcome: "found" });
    expect(
      fetchImpl.mock.calls.filter(([, init]) => isOutline(init)),
    ).toHaveLength(1);
  });
});

describe("NWI drawing", () => {
  const EMERGENT = "Freshwater Emergent Wetland";
  const POND = "Freshwater Pond";

  /** A drawing of the lot's view, `paint` choosing each pixel's RGBA. */
  function drawing(
    paint: (col: number, row: number) => [number, number, number, number],
  ) {
    const view = renderView(lot);
    const data = new Uint8Array(view.width * view.height * 4);
    for (let row = 0; row < view.height; row += 1) {
      for (let col = 0; col < view.width; col += 1) {
        data.set(paint(col, row), (row * view.width + col) * 4);
      }
    }
    return { view, png: { width: view.width, height: view.height, data } };
  }

  it("asks for an image with the lot's proportions, 512 pixels on the long side", () => {
    const view = renderView(lot);
    expect(Math.max(view.width, view.height)).toBe(512);
    const [xmin, ymin, xmax, ymax] = view.bbox;
    expect((xmax - xmin) / (ymax - ymin)).toBeCloseTo(
      view.width / view.height,
      6,
    );
  });

  it("measures the share of the lot in each type's colour", () => {
    const { view, png } = drawing((col) =>
      col < renderView(lot).width / 2 ? [0, 0, 255, 255] : [0, 0, 0, 0],
    );
    // Freshwater Emergent Wetland is the third NWI type: blue.
    expect(NWI_WETLAND_TYPES.indexOf(EMERGENT)).toBe(2);
    const result = measureDrawing(view, png, [EMERGENT, POND]);
    expect(result.shares.get(EMERGENT)).toBeCloseTo(0.5, 2);
    expect(result.shares.has(POND)).toBe(false);
    expect(result.share).toBeCloseTo(0.5, 2);
  });

  it("does not count blended edge pixels, faint pixels, or types not asked for", () => {
    const { view, png } = drawing((col) => {
      if (col % 4 === 0) return [128, 128, 128, 255]; // a blend of two colours
      if (col % 4 === 1) return [0, 0, 255, 60]; // mostly transparent
      if (col % 4 === 2) return [255, 0, 0, 255]; // a type not on the lot
      return [255, 0, 255, 255]; // Freshwater Pond
    });
    const result = measureDrawing(view, png, [EMERGENT, POND]);
    expect(result.shares.get(POND)).toBeCloseTo(0.25, 2);
    expect(result.share).toBeCloseTo(0.25, 2);
  });
});

describe("NWI client outcomes", () => {
  const answering = (byUrl: (url: string) => unknown) =>
    createNwiWetlandsClient({
      now: () => new Date(AT),
      fetch: vi.fn<typeof fetch>(
        async (input) => new Response(JSON.stringify(byUrl(String(input)))),
      ),
    });

  it("is missing, not 'no wetland', where NWI has no mapping project", async () => {
    const client = answering(() => ({ features: [] }));
    expect(await client.wetlands(lot, new AbortController().signal)).toEqual({
      outcome: "missing",
      retrievedAt: AT,
    });
  });

  it("finds no wetland only where a mapping project covers the lot", async () => {
    const client = answering((url) =>
      url.startsWith(NWI_IMAGE_YEAR_LAYER)
        ? { features: [{ attributes: { IMAGE_YR: 2007 } }] }
        : { features: [] },
    );
    expect(await client.wetlands(lot, new AbortController().signal)).toEqual({
      outcome: "found",
      retrievedAt: AT,
      wetlands: [],
      share: 0,
      imageYears: [2007],
    });
  });

  it("refuses a wetland type it has no colour for, rather than leaving it uncounted", async () => {
    const client = answering((url) =>
      url.startsWith(NWI_IMAGE_YEAR_LAYER)
        ? { features: [{ attributes: { IMAGE_YR: 2007 } }] }
        : {
            features: [
              { attributes: { ATTRIBUTE: "X1", WETLAND_TYPE: "Mangrove" } },
            ],
          },
    );
    expect(await client.wetlands(lot, new AbortController().signal)).toEqual({
      outcome: "timeout",
      cause: "unavailable",
    });
  });
});

describe("environmentalCheck wording", () => {
  const found = (
    wetlands: { type: string; codes: string[]; share: number }[],
  ): WetlandsOutcome => ({
    outcome: "found",
    retrievedAt: AT,
    wetlands,
    share: wetlands.reduce((sum, w) => sum + w.share, 0),
    imageYears: [1994, 2007],
  });
  const check = (wetlands: WetlandsOutcome, parcel = secondCountyParcel) =>
    environmentalCheck(parcel, {
      wetlands,
      wetlandsTimeoutMs: 10_000,
      setbacks: null,
      setbacksTimeoutMs: 6_000,
    });

  it("names a wetland that only touches the lot's edge, and still asks for review", () => {
    const result = check(
      found([{ type: "Freshwater Pond", codes: ["PUBG"], share: 0 }]),
    );
    expect(result.status).toBe("needsReview");
    expect(result.finding).toBe(
      "The National Wetlands Inventory maps Freshwater Pond (PUBG) along the edge of this lot.",
    );
  });

  it("writes tiny and whole shares plainly, and every imagery year", () => {
    expect(
      check(found([{ type: "Lake", codes: ["L1UBH"], share: 0.0004 }])).finding,
    ).toBe(
      "The National Wetlands Inventory maps Lake (L1UBH) on less than 0.1% of this lot.",
    );
    const whole = check(found([{ type: "Lake", codes: ["L1UBH"], share: 1 }]));
    expect(whole.finding).toBe(
      "The National Wetlands Inventory maps Lake (L1UBH) on all of this lot.",
    );
    expect(whole.limitation).toContain("(here from 1994 and 2007)");
  });

  it("is unknown with the source it asked when NWI has no mapping for the lot", () => {
    const result = check({ outcome: "missing", retrievedAt: AT });
    expect(result).toMatchObject({
      status: "unknown",
      finding:
        "The National Wetlands Inventory has no mapping for this lot, so no wetland was checked.",
      sources: [
        {
          title:
            "National Wetlands Inventory: no mapping project covers the parcel",
          url: NWI_IMAGE_YEAR_LAYER,
          retrievedAt: AT,
        },
      ],
    });
  });

  it("lists two setbacks on one Franklin lot", () => {
    const result = environmentalCheck(goldenParcel, {
      wetlands: found([]),
      wetlandsTimeoutMs: 10_000,
      setbacks: {
        outcome: "found",
        retrievedAt: AT,
        setbacks: [
          { name: "Big Darby Creek Watershed Riparian Setbacks", share: 0.3 },
          {
            name: "Alum Creek and Big Walnut Creek Watersheds Riparian Setbacks",
            share: 0.12,
          },
        ],
        share: 0.42,
      },
      setbacksTimeoutMs: 6_000,
    });
    expect(result.status).toBe("needsReview");
    expect(result.finding).toBe(
      "The National Wetlands Inventory maps no wetland on this lot. Franklin County's stream-buffer map puts about 30% of it inside the Big Darby Creek Watershed Riparian Setbacks and about 12% of it inside the Alum Creek and Big Walnut Creek Watersheds Riparian Setbacks.",
    );
  });
});

describe("environmental in the report", () => {
  const blank = (kind: CheckKind, status: CheckStatus): Check => ({
    kind,
    status,
    finding: "",
    limitation: "",
    sources: [],
    responsibleParty: { role: "" },
    nextAction: "",
  });

  it("ranks environmental after access, septic, and zoning, and ahead of flood", () => {
    expect(OPEN_QUESTION_PRIORITY.slice(0, 5)).toEqual([
      "access",
      "septic",
      "zoning",
      "environmental",
      "flood",
    ]);
    expect(
      biggestOpenQuestion(
        [blank("flood", "unknown"), blank("environmental", "needsReview")],
        { floodInSfha: false },
      ),
    ).toBe("environmental");
    expect(
      biggestOpenQuestion(
        [blank("zoning", "unknown"), blank("environmental", "needsReview")],
        { floodInSfha: false },
      ),
    ).toBe("zoning");
  });

  it("keeps the template, naming who resolves it, when no NWI client is configured", async () => {
    expect(TEMPLATE_KINDS).toContain("environmental");
    const { report } = await buildReport(secondCountyParcel, {
      fema: {
        floodZones: async () => ({ outcome: "timeout", cause: "unavailable" }),
      },
      floodTimeoutMs: 1_000,
      now: () => new Date(AT),
    });
    const environmental = report.checks.find((c) => c.kind === "environmental");
    expect(environmental).toEqual(
      templateCheck("environmental", secondCountyParcel),
    );
    expect(environmental).toMatchObject({
      status: "unknown",
      sources: [],
      responsibleParty: {
        role: "County soil and water conservation district, or a wetland consultant",
        organization: "Licking Soil and Water Conservation District",
      },
    });
    expect(
      templateCheck("environmental", goldenParcel).responsibleParty,
    ).toEqual({
      role: "County soil and water conservation district, or a wetland consultant",
      organization: "Franklin Soil & Water Conservation District",
      publicContactUrl: "https://www.franklinswcd.org/",
    });
  });

  it("guards the whole check when a source ignores its limit", async () => {
    const { report, complete } = await buildReport(goldenParcel, {
      fema: {
        floodZones: async () => ({ outcome: "timeout", cause: "unavailable" }),
      },
      floodTimeoutMs: 1_000,
      // Never resolves and ignores the abort signal.
      wetlands: { wetlands: () => new Promise(() => {}) },
      wetlandsTimeoutMs: 100,
      streamBuffers: { setbacks: () => new Promise(() => {}) },
      streamBuffersTimeoutMs: 150,
      now: () => new Date(AT),
    });
    expect(complete).toBe(false);
    expect(report.checks.find((c) => c.kind === "environmental")).toMatchObject(
      {
        status: "unknown",
        finding:
          "The National Wetlands Inventory did not answer within 0.1 seconds, so no wetland was checked. Franklin County's stream-buffer map did not answer within 0.2 seconds, so the riparian setback was not checked.",
      },
    );
  });
});
