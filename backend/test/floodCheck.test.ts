import { describe, expect, it } from "vitest";
import type { FloodZone } from "../src/reports/femaFlood.js";
import { floodCheck, SFHA_NEXT_ACTION } from "../src/reports/floodCheck.js";

const AT = "2026-11-19T00:00:00.000Z";

const found = (...zones: FloodZone[]) =>
  floodCheck(
    {
      outcome: "found",
      retrievedAt: AT,
      zones,
      partlyNotIncluded: false,
      panels: [{ id: "39049C0431K", effectiveDate: "2008-06-17" }],
      lomrs: [],
    },
    8_000,
  );

const sfha = (zone: string, subtype?: string): FloodZone => ({
  zone,
  ...(subtype ? { subtype } : {}),
  specialFloodHazardArea: true,
});

const minimal: FloodZone = {
  zone: "X",
  subtype: "AREA OF MINIMAL FLOOD HAZARD",
  specialFloodHazardArea: false,
};

describe("the flood check's status", () => {
  it.each(["A", "AE", "AO", "AH", "V", "VE"])(
    "needs review when the lot is in Zone %s",
    (zone) => {
      const check = found(sfha(zone));
      expect(check.status).toBe("needsReview");
      expect(check.nextAction).toBe(SFHA_NEXT_ACTION);
      expect(check.finding).toContain(`Zone ${zone}`);
      expect(check.responsibleParty.role).toContain("floodplain administrator");
    },
  );

  it("needs review when only a sliver of a mostly Zone X lot is in a floodway", () => {
    const check = found(minimal, sfha("AE", "FLOODWAY"));
    expect(check.status).toBe("needsReview");
    expect(check.nextAction).toBe(SFHA_NEXT_ACTION);
  });

  it("stays evidence found in Zone X (minimal flood hazard)", () => {
    const check = found(minimal);
    expect(check.status).toBe("evidenceFound");
    expect(check.nextAction).not.toBe(SFHA_NEXT_ACTION);
    expect(check.responsibleParty.role).toBe("FEMA flood map");
  });

  it("keeps the dated panel as a source either way", () => {
    for (const check of [found(minimal), found(sfha("AE"))]) {
      expect(check.sources).toContainEqual(
        expect.objectContaining({
          title: "Flood Insurance Rate Map panel 39049C0431K",
          effectiveDate: "2008-06-17",
        }),
      );
    }
  });
});
