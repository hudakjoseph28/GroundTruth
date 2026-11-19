import type {
  Check,
  Parcel,
  ResponsibleParty,
  Source,
} from "@groundtruth/shared";
import {
  FRANKLIN_STREAM_BUFFERS_LAYER,
  type Setback,
  type StreamSetbackOutcome,
} from "./franklinStreamBuffers.js";
import {
  NWI_IMAGE_YEAR_LAYER,
  NWI_MAPPER,
  NWI_WETLANDS_LAYER,
  type Wetland,
  type WetlandsOutcome,
} from "./nwiWetlands.js";
import { percent } from "./sampling.js";

const FRANKLIN_FIPS = "39049";

/** Franklin Soil & Water Conservation District, confirmed live 2026-11-18. */
const FRANKLIN_SWCD_URL = "https://www.franklinswcd.org/";

const COUNTY_PLANNING: ResponsibleParty = {
  role: "County planning office (riparian setbacks)",
  organization: "Franklin County Economic Development & Planning",
  publicContactUrl:
    "https://www.franklincountyohio.gov/Business-Development/Development-Planning/Planning-Zoning",
};

/**
 * Who can say whether a lot has wetlands: the county soil and water
 * conservation district (every Ohio county has one) or a wetland consultant.
 * Shared with the `environmental` template.
 */
export function wetlandsParty(parcel: Parcel): ResponsibleParty {
  return {
    role: "County soil and water conservation district, or a wetland consultant",
    ...(parcel.countyFips === FRANKLIN_FIPS
      ? {
          organization: "Franklin Soil & Water Conservation District",
          publicContactUrl: FRANKLIN_SWCD_URL,
        }
      : {
          organization: `${parcel.county} Soil and Water Conservation District`,
        }),
  };
}

export interface EnvironmentalInputs {
  wetlands: WetlandsOutcome;
  wetlandsTimeoutMs: number;
  /** Franklin parcels only; `null` where no county setback map is read. */
  setbacks: StreamSetbackOutcome | null;
  setbacksTimeoutMs: number;
}

/**
 * One `environmental` check from two independent answers: NWI wetlands for
 * every parcel, and Franklin County's riparian setbacks for Franklin parcels.
 *
 * - `needsReview` when either maps something on the lot. A mapped wetland or
 *   setback is a fact that needs a qualified person before building.
 * - `evidenceFound` only when every source that applies answered and maps
 *   nothing: NWI has mapped the lot and drew no wetland, and (in Franklin)
 *   no setback covers it. The limitation says plainly that this is not a
 *   wetland delineation.
 * - `unknown` otherwise: a source failed, timed out, or has no mapping here,
 *   and nothing was found by the other.
 */
export function environmentalCheck(
  parcel: Parcel,
  inputs: EnvironmentalInputs,
): Check {
  const { wetlands, setbacks } = inputs;
  const wet = wetlands.outcome === "found" && wetlands.wetlands.length > 0;
  const setback = setbacks?.outcome === "found" && setbacks.setbacks.length > 0;
  const dry =
    wetlands.outcome === "found" &&
    !wet &&
    (setbacks === null || (setbacks.outcome === "found" && !setback));

  const finding = [wetlandsFinding(inputs)];
  if (setbacks)
    finding.push(setbacksFinding(setbacks, inputs.setbacksTimeoutMs));
  const sources = [
    ...wetlandsSources(wetlands),
    ...(setbacks ? setbacksSources(setbacks) : []),
  ];

  if (wet || setback) {
    const limitation = [wetlandsLimitation(wetlands)];
    if (setback) {
      limitation.push(
        "The stream-buffer map shows where the county's riparian setback applies. What may be built, graded, or placed inside it is set by the county's setback rules, which this check does not read.",
      );
    }
    const nextAction: string[] = [];
    if (wet) {
      nextAction.push(
        "Before you plan a building, driveway, septic system, or fill near the mapped wetland, have a wetland consultant delineate it and ask whether a permit applies.",
      );
    }
    if (setback) {
      nextAction.push(
        "Ask Franklin County Economic Development & Planning what the riparian setback allows on this lot.",
      );
    }
    return {
      kind: "environmental",
      status: "needsReview",
      finding: finding.join(" "),
      limitation: limitation.join(" "),
      sources,
      responsibleParty: setback ? setbackParty(wet) : wetlandsParty(parcel),
      nextAction: nextAction.join(" "),
    };
  }

  if (dry && wetlands.outcome === "found") {
    return {
      kind: "environmental",
      status: "evidenceFound",
      finding: finding.join(" "),
      limitation: [
        wetlandsLimitation(wetlands),
        ...(setbacks
          ? [
              "The county's stream-buffer map covers its mapped setback watersheds; a city, village, or township with its own zoning may set its own stream rules.",
            ]
          : []),
      ].join(" "),
      sources,
      responsibleParty: wetlandsParty(parcel),
      nextAction:
        "If the lot has low, wet, or wooded ground, ask the county soil and water conservation district or a wetland consultant whether a wetland delineation is worth doing before you build.",
    };
  }

  return {
    kind: "environmental",
    status: "unknown",
    finding: finding.join(" "),
    limitation: [
      wetlandsLimitation(wetlands),
      ...(setbacks?.outcome === "timeout"
        ? [
            "The riparian setback was not checked, so it is not ruled in or out.",
          ]
        : []),
    ].join(" "),
    sources,
    responsibleParty: wetlandsParty(parcel),
    nextAction: `Reload the report to ask again, or look the lot up on the NWI Wetlands Mapper (${NWI_MAPPER}) and ask the county soil and water conservation district.`,
  };
}

/** What the NWI answer does not establish. */
function wetlandsLimitation(outcome: WetlandsOutcome): string {
  if (outcome.outcome !== "found") {
    return "Wetlands were not checked, so none are ruled in or out.";
  }
  if (outcome.wetlands.length === 0) {
    return `"NWI shows none" is not a wetland delineation. The NWI is drawn from aerial imagery${imagery(outcome.imageYears)} and misses many small, forested, or seasonally dry wetlands; only a delineation in the field, confirmed by the U.S. Army Corps of Engineers or Ohio EPA, says whether regulated wetlands are on the lot.`;
  }
  return `NWI outlines are drawn from aerial imagery${imagery(outcome.imageYears)} and are approximate: they are not a wetland delineation, and the shares are measured against the mapped OGRIP boundary, not a survey. Filling or building in a wetland or stream can need a Clean Water Act Section 404 permit from the U.S. Army Corps of Engineers or a permit from Ohio EPA.`;
}

function wetlandsFinding(inputs: EnvironmentalInputs): string {
  const outcome = inputs.wetlands;
  switch (outcome.outcome) {
    case "timeout":
      return outcome.cause === "timedOut"
        ? `The National Wetlands Inventory did not answer within ${formatSeconds(inputs.wetlandsTimeoutMs)}, so no wetland was checked.`
        : "The National Wetlands Inventory could not be reached, so no wetland was checked.";
    case "missing":
      return "The National Wetlands Inventory has no mapping for this lot, so no wetland was checked.";
    case "found": {
      const [only, ...rest] = outcome.wetlands;
      if (!only) {
        return "The National Wetlands Inventory maps no wetland on this lot.";
      }
      if (rest.length === 0) {
        return `The National Wetlands Inventory maps ${typeName(only)} ${onShare(only.share, "this lot")}.`;
      }
      return `The National Wetlands Inventory maps wetland or open water ${onShare(outcome.share, "this lot")}: ${list(
        outcome.wetlands.map(
          (wetland) => `${typeName(wetland)} ${onShare(wetland.share)}`,
        ),
      )}.`;
    }
  }
}

function setbacksFinding(
  outcome: StreamSetbackOutcome,
  timeoutMs: number,
): string {
  if (outcome.outcome === "timeout") {
    return outcome.cause === "timedOut"
      ? `Franklin County's stream-buffer map did not answer within ${formatSeconds(timeoutMs)}, so the riparian setback was not checked.`
      : "Franklin County's stream-buffer map could not be reached, so the riparian setback was not checked.";
  }
  if (outcome.setbacks.length === 0) {
    return "Franklin County's stream-buffer map puts no part of it in a riparian setback.";
  }
  return `Franklin County's stream-buffer map puts ${list(
    outcome.setbacks.map(
      (area) => `${shareOf(area.share)} of it inside the ${area.name}`,
    ),
  )}.`;
}

function wetlandsSources(outcome: WetlandsOutcome): Source[] {
  if (outcome.outcome === "timeout") return [];
  const authority = "U.S. Fish and Wildlife Service";
  if (outcome.outcome === "missing") {
    return [
      {
        authority,
        title:
          "National Wetlands Inventory: no mapping project covers the parcel",
        url: NWI_IMAGE_YEAR_LAYER,
        retrievedAt: outcome.retrievedAt,
      },
    ];
  }
  return [
    {
      authority,
      title:
        outcome.wetlands.length > 0
          ? `National Wetlands Inventory: ${list(outcome.wetlands.map((w) => w.type.toLowerCase()))} mapped on the parcel`
          : "National Wetlands Inventory: no wetland mapped on the parcel",
      url: NWI_WETLANDS_LAYER,
      retrievedAt: outcome.retrievedAt,
    },
    ...(outcome.imageYears.length > 0
      ? [
          {
            authority,
            title: `National Wetlands Inventory: mapped from ${years(outcome.imageYears)} imagery`,
            url: NWI_IMAGE_YEAR_LAYER,
            retrievedAt: outcome.retrievedAt,
          },
        ]
      : []),
  ];
}

function setbacksSources(outcome: StreamSetbackOutcome): Source[] {
  if (outcome.outcome === "timeout") return [];
  return [
    {
      authority: "Franklin County Economic Development & Planning",
      title:
        outcome.setbacks.length > 0
          ? `Stream buffers: ${list(outcome.setbacks.map((area: Setback) => `${area.name} cover ${shareOf(area.share)} of the parcel`))}`
          : "Stream buffers: no riparian setback on the parcel",
      url: FRANKLIN_STREAM_BUFFERS_LAYER,
      retrievedAt: outcome.retrievedAt,
    },
  ];
}

function setbackParty(wet: boolean): ResponsibleParty {
  return wet
    ? {
        ...COUNTY_PLANNING,
        role: "Wetland consultant, and the county planning office for the riparian setback",
      }
    : COUNTY_PLANNING;
}

/** `Freshwater Emergent Wetland (PEM1A)`. */
function typeName(wetland: Wetland): string {
  return wetland.codes.length > 0
    ? `${wetland.type} (${wetland.codes.join(", ")})`
    : wetland.type;
}

/** `about 4.7%`, `less than 0.1%`, or `none` when no sample fell inside. */
function shareOf(share: number): string {
  if (share <= 0) return "none";
  if (share < 0.001) return "less than 0.1%";
  if (share >= 0.9995) return "all";
  return `about ${percent(share)}`;
}

/** `on about 31% of this lot`, or `along the edge of this lot`. */
function onShare(share: number, of?: string): string {
  if (share <= 0) return of ? `along the edge of ${of}` : "along the edge";
  if (share >= 0.9995) return of ? `on all of ${of}` : "on all of it";
  return of ? `on ${shareOf(share)} of ${of}` : `on ${shareOf(share)}`;
}

/** ` (here from 2007)`, or nothing when NWI gives no year. */
function imagery(imageYears: number[]): string {
  return imageYears.length > 0 ? ` (here from ${years(imageYears)})` : "";
}

function years(values: number[]): string {
  return list(values.map(String));
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
