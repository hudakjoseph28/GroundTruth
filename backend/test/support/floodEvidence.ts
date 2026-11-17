import type { Check } from "@groundtruth/shared";

/** FEMA FIRM panel numbers: state+county FIPS, `C`, panel, suffix (`39049C0290K`). */
const FIRM_PANEL = /\b(\d{5}C\d{4}[A-Z])\b/;
/** `Zone X (area of minimal flood hazard)` or `Zone X, area of minimal flood hazard`. */
const ZONE = /\bZone ([A-Z0-9]{1,3})\b(?:\s*[(,]\s*([a-z0-9.% ]+?)\s*[),.])?/;

export interface FloodEvidence {
  status: Check["status"];
  /** Each zone named in the finding, as `X: area of minimal flood hazard`. */
  zones: string[];
  /** Every FIRM panel cited as a source, as `id@effectiveDate`, sorted. */
  panels: string[];
}

/**
 * Test-only: the facts a flood check rests on, independent of wording,
 * source titles, and source order, so a hand-verified seeded check and a
 * live one can be compared on zone and the set of panels.
 */
export function floodEvidence(check: Check): FloodEvidence {
  const zones = [...check.finding.matchAll(new RegExp(ZONE.source, "g"))].map(
    ([, zone, subtype]) =>
      subtype ? `${zone}: ${subtype.toLowerCase()}` : `${zone}`,
  );
  const panels = check.sources.flatMap((source) => {
    const id = FIRM_PANEL.exec(source.title)?.[1];
    return id ? [`${id}@${source.effectiveDate ?? "undated"}`] : [];
  });
  return {
    status: check.status,
    zones: [...new Set(zones)],
    panels: [...new Set(panels)].sort(),
  };
}
