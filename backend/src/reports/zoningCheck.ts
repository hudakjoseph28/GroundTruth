import type { Check, ResponsibleParty, Source } from "@groundtruth/shared";
import {
  FCEDP_ZONING_LAYER,
  MEANINGFUL_SHARE,
  ZONING_RESOLUTION,
  type ZoningDistrict,
  type ZoningOutcome,
} from "./franklinZoning.js";

const COUNTY_ZONING: ResponsibleParty = {
  role: "County zoning office",
  organization: "Franklin County Economic Development & Planning",
  publicContactUrl:
    "https://www.franklincountyohio.gov/Business-Development/Development-Planning/Planning-Zoning",
};

const LOCAL_ZONING: ResponsibleParty = {
  role: "Zoning office for the city, village, or township that contains the lot",
};

/**
 * Turns a Franklin County zoning outcome into a check. A finding names the
 * district and nothing more: what a district allows on a given lot depends
 * on rules, frontage, setbacks, and overlays this check does not read.
 */
export function zoningCheck(outcome: ZoningOutcome, timeoutMs: number): Check {
  switch (outcome.outcome) {
    case "timeout":
      return {
        kind: "zoning",
        status: "unknown",
        finding:
          outcome.cause === "timedOut"
            ? `Franklin County's zoning map did not answer within ${formatSeconds(timeoutMs)}, so no zoning district was checked.`
            : "Franklin County's zoning map could not be reached, so no zoning district was checked.",
        limitation: "No zoning conclusion either way.",
        sources: [],
        responsibleParty: COUNTY_ZONING,
        nextAction:
          "Reload the report to ask the county map again, or ask Franklin County Economic Development & Planning which district applies.",
      };
    case "missing":
      return {
        kind: "zoning",
        status: "unknown",
        finding:
          "Franklin County's zoning map does not cover this parcel. The county zones only the unincorporated parts of the townships under county zoning, so a city, village, or township with its own zoning decides here.",
        limitation:
          "No zoning conclusion either way. The county map leaving a lot out does not say which district applies.",
        sources: [layerSource(outcome.retrievedAt)],
        responsibleParty: LOCAL_ZONING,
        nextAction:
          "Ask the zoning office for the city, village, or township that contains the lot which district applies.",
      };
    case "found": {
      const [first, ...rest] = outcome.districts;
      const single =
        first !== undefined &&
        rest.length === 0 &&
        outcome.uncovered < MEANINGFUL_SHARE &&
        outcome.contradicted < MEANINGFUL_SHARE;
      if (single) {
        return {
          kind: "zoning",
          status: "evidenceFound",
          finding: `Franklin County's zoning map places ${coverage(first.share)} in the ${districtName(first)}.`,
          limitation:
            "A zoning map names the district. It does not say what this lot may be used for or built on: the district's rules in the Zoning Resolution, road frontage, setbacks, and overlays still apply, and it is not a zoning certificate.",
          sources: [layerSource(outcome.retrievedAt), resolutionSource()],
          responsibleParty: COUNTY_ZONING,
          nextAction:
            "Ask Franklin County Economic Development & Planning to confirm the district and what it allows on this lot.",
        };
      }
      return {
        kind: "zoning",
        status: "needsReview",
        finding: splitFinding(outcome),
        limitation:
          "Different parts of a split lot can follow different rules, and the map alone does not say which applies where.",
        sources: [layerSource(outcome.retrievedAt), resolutionSource()],
        responsibleParty: COUNTY_ZONING,
        nextAction:
          "Ask Franklin County Economic Development & Planning how the district lines apply to this lot before planning anything on it.",
      };
    }
  }
}

function splitFinding(
  outcome: Extract<ZoningOutcome, { outcome: "found" }>,
): string {
  const [only] = outcome.districts;
  const sentences = [
    outcome.districts.length === 1 && only
      ? `Franklin County's zoning map places about ${percent(only.share)} of this parcel in the ${districtName(only)}.`
      : `Franklin County's zoning map splits this parcel: ${list(
          outcome.districts.map(
            (district) =>
              `about ${percent(district.share)} in the ${districtName(district)}`,
          ),
        )}.`,
  ];
  if (outcome.uncovered >= MEANINGFUL_SHARE) {
    sentences.push(
      `About ${percent(outcome.uncovered)} of it is not in any county zoning district.`,
    );
  }
  if (outcome.contradicted >= MEANINGFUL_SHARE) {
    sentences.push(
      `The same map also marks about ${percent(outcome.contradicted)} of it as not in county jurisdiction, so the map disagrees with itself there.`,
    );
  }
  return sentences.join(" ");
}

function districtName(district: ZoningDistrict): string {
  return district.className
    ? `${district.className} (${district.code})`
    : `district ${district.code}`;
}

/** `the whole parcel`, or `about 99.6% of the parcel` for an edge sliver. */
function coverage(share: number): string {
  return share >= 0.9995
    ? "the whole parcel"
    : `about ${percent(share)} of the parcel (the rest is a sliver along its edge)`;
}

function percent(share: number): string {
  const value = share * 100;
  const rounded =
    value >= 99 || value < 10 ? value.toFixed(1) : value.toFixed(0);
  return `${rounded.replace(/\.0$/, "")}%`;
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function layerSource(retrievedAt: string): Source {
  return {
    authority: "Franklin County Economic Development & Planning",
    title: "FCEDP Zoning Districts 2025: districts under the parcel",
    url: FCEDP_ZONING_LAYER,
    retrievedAt,
  };
}

function resolutionSource(): Source {
  return {
    authority: "Franklin County Economic Development & Planning",
    title: ZONING_RESOLUTION.title,
    url: ZONING_RESOLUTION.url,
    retrievedAt: ZONING_RESOLUTION.retrievedAt,
  };
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
