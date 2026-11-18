import type { Check, ResponsibleParty, Source } from "@groundtruth/shared";
import {
  FCEO_ROAD_LAYER,
  FRANKLIN_ROW_LAYER,
  isFreeway,
  isOutOfCounty,
  TOUCH_TOLERANCE_M,
  type AccessOutcome,
  type MappedRoad,
} from "./franklinAccess.js";

const TITLE_REVIEW: ResponsibleParty = {
  role: "Title reviewer, then the road authority",
  organization: "Franklin County Recorder",
  publicContactUrl:
    "https://www.franklincountyohio.gov/Agency-Directory/Recorder/Real-Estate/Recording-FAQs",
};

const TITLE_THEN_SURVEY: ResponsibleParty = {
  ...TITLE_REVIEW,
  role: "Title reviewer, then surveyor",
};

/** What neither county layer can show, whatever they find. */
const NOT_LEGAL_ACCESS =
  "Touching a mapped right-of-way is not legal access. These layers do not show whether the lot has a recorded right to use the road, whether the road is built and maintained where the lot meets it, or whether a driveway would be permitted there.";

const LAYERS_ONLY =
  "These layers show mapped right-of-way and road centerlines. They do not show recorded easements, private lanes, or other legal access, so they cannot establish whether the parcel has access.";

/**
 * Turns a Franklin County access outcome into a check. A finding says what
 * the county's right-of-way and road layers show beside the parcel and
 * never that the parcel has, or lacks, legal access.
 */
export function accessCheck(outcome: AccessOutcome, timeoutMs: number): Check {
  switch (outcome.outcome) {
    case "timeout":
      return {
        kind: "access",
        status: "unknown",
        finding:
          outcome.cause === "timedOut"
            ? `Franklin County's road maps did not answer within ${formatSeconds(timeoutMs)}, so road access was not checked.`
            : "Franklin County's road maps could not be reached, so road access was not checked.",
        limitation: "No access conclusion either way.",
        sources: [],
        responsibleParty: TITLE_THEN_SURVEY,
        nextAction:
          "Reload the report to ask the county maps again, or ask a title company to search recorded access rights.",
      };
    case "notTouching":
      return {
        kind: "access",
        status: "needsReview",
        finding: [
          "No public road right-of-way touches this parcel in Franklin County's right-of-way layer.",
          ...nearestSentences(outcome, " in the county engineer's road layer"),
        ].join(" "),
        limitation: LAYERS_ONLY,
        sources: [
          rowSource(
            outcome.retrievedAt,
            "no public road right-of-way touches the parcel",
          ),
          roadSource(outcome.retrievedAt, nearestTitle(outcome)),
        ],
        responsibleParty: TITLE_THEN_SURVEY,
        nextAction: outcome.nearest
          ? `Ask a title company to search for recorded legal access to ${outcome.nearest.name} or another public road, such as an easement across a neighboring lot, and have a surveyor show where it runs.`
          : "Ask a title company to search for recorded legal access to a public road, such as an easement across a neighboring lot, and have a surveyor show where it runs.",
      };
    case "touches":
      return touchesCheck(outcome);
  }
}

function touchesCheck(
  outcome: Extract<AccessOutcome, { outcome: "touches" }>,
): Check {
  const [front] = outcome.roads;
  const rowTitle = `public road right-of-way within ${TOUCH_TOLERANCE_M} m of the parcel`;
  if (!front) {
    return {
      kind: "access",
      status: "needsReview",
      finding: [
        `A public road right-of-way${recordedAs(outcome.rowTypes)} touches this parcel in Franklin County's right-of-way layer, but the county engineer's road layer shows no road centerline running through it beside the parcel. It may be land set aside for a road that was never built, or the edge of a wider road corridor.`,
        ...nearestSentences(outcome, ""),
      ].join(" "),
      limitation: NOT_LEGAL_ACCESS,
      sources: [
        rowSource(outcome.retrievedAt, rowTitle),
        roadSource(outcome.retrievedAt, nearestTitle(outcome)),
      ],
      responsibleParty: TITLE_THEN_SURVEY,
      nextAction:
        "Ask a title company whether the right-of-way beside the lot is an open public road, and have a surveyor show where the lot meets it.",
    };
  }

  const names = list(outcome.roads.map((road) => road.name));
  const sentences = [
    `This parcel touches the public right-of-way of ${names} in Franklin County's right-of-way layer.`,
    front.distanceM < 1
      ? `In the county engineer's road layer, the ${front.name} centerline meets the parcel boundary.`
      : `In the county engineer's road layer, the ${front.name} centerline is ${distance(front.distanceM)} from the parcel.`,
  ];
  const freewaysOnly = outcome.roads.every(isFreeway);
  if (freewaysOnly) {
    sentences.push(FREEWAY_NOTE(outcome.roads.length === 1 ? "it" : "them"));
  }
  const authority = front.jurisdiction
    ? `the road authority (${front.jurisdiction}, per the county road layer)`
    : "the road authority";
  return {
    kind: "access",
    status: freewaysOnly ? "needsReview" : "evidenceFound",
    finding: sentences.join(" "),
    limitation: NOT_LEGAL_ACCESS,
    sources: [
      rowSource(outcome.retrievedAt, rowTitle),
      roadSource(
        outcome.retrievedAt,
        front.distanceM < 1
          ? `${front.name} centerline meets the parcel boundary`
          : `${front.name} centerline ${distance(front.distanceM)} from the parcel`,
      ),
    ],
    responsibleParty: TITLE_REVIEW,
    nextAction: freewaysOnly
      ? `Ask a title company to search for recorded access to a road other than ${names}, and ask the Ohio Department of Transportation whether any access to ${front.name} is allowed here.`
      : `Ask a title company to confirm the lot's recorded right to reach ${front.name}, and ask ${authority} what a driveway permit needs.`,
  };
}

function nearestSentences(
  outcome: { nearest: MappedRoad | null; searchedM: number },
  where: string,
): string[] {
  const road = outcome.nearest;
  if (!road) {
    return [
      `The county engineer's road layer shows no road within ${distance(outcome.searchedM)} of it.`,
    ];
  }
  return [
    `The nearest mapped road, ${described(road)}, is ${distance(road.distanceM)} away${where}.`,
    ...(isFreeway(road) ? [FREEWAY_NOTE("it")] : []),
  ];
}

const FREEWAY_NOTE = (pronoun: "it" | "them") =>
  `The road layer lists ${pronoun} in the federal highway system (interstates and expressways), and those are usually limited-access, with no driveways.`;

/** ` (recorded as "Highway")`, or nothing when the layer gives no type. */
function recordedAs(types: string[]): string {
  if (types.length === 0) return "";
  return ` (recorded as ${list(types.map((type) => `"${type}"`))})`;
}

function nearestTitle(outcome: {
  nearest: MappedRoad | null;
  searchedM: number;
}) {
  return outcome.nearest
    ? `nearest road ${outcome.nearest.name}, ${distance(outcome.nearest.distanceM)}`
    : `no road within ${distance(outcome.searchedM)}`;
}

function described(road: MappedRoad): string {
  return isOutOfCounty(road)
    ? `${road.name} (outside Franklin County)`
    : road.name;
}

/** `about 106 m (348 ft)`; `about 1.6 km (1 mile)` past a kilometre. */
export function distance(metres: number): string {
  if (metres < 1) return "less than 1 m";
  if (metres >= 1_000) {
    const km = (Math.round(metres / 100) / 10).toFixed(1).replace(/\.0$/, "");
    const miles = Math.round((metres / 1_609.344) * 10) / 10;
    return `about ${km} km (${miles} mile${miles === 1 ? "" : "s"})`;
  }
  return `about ${Math.round(metres)} m (${Math.round(metres / 0.3048)} ft)`;
}

function rowSource(retrievedAt: string, detail: string): Source {
  return {
    authority: "Franklin County",
    title: `Tax parcel right-of-way layer: ${detail}`,
    url: FRANKLIN_ROW_LAYER,
    retrievedAt,
  };
}

function roadSource(retrievedAt: string, detail: string): Source {
  return {
    authority: "Franklin County Engineer",
    title: `Public road sections: ${detail}`,
    url: FCEO_ROAD_LAYER,
    retrievedAt,
  };
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
