import {
  NO_PUBLIC_SEWER,
  type Check,
  type Parcel,
  type ResponsibleParty,
  type Source,
} from "@groundtruth/shared";
import { FRANKLIN_COUNTY_FIPS } from "./franklinZoning.js";
import {
  EPA_SEWERSHEDS_LAYER,
  EPA_WATER_SYSTEMS_LAYER,
  FCSE_NAME,
  FCSE_PAGE,
  FCSE_SERVICE_AREAS_LAYER,
  MAIN_SEARCH_M,
  type CountyServiceArea,
  type MainAnswer,
  type NearestMain,
  type SourceAnswer,
  type UtilitiesOutcome,
  type UtilityKind,
} from "./utilities.js";

/**
 * A public sewer main this close to the lot's boundary counts as adjacent:
 * in the street in front of it or in an easement along it. Main maps are
 * drawn from as-builts and are not surveys, so this is not a tap location.
 */
export const ADJACENT_MAIN_M = 30;

/** Every outcome says this, in the limitation. */
export const MAPS_ARE_NOT_PERMITS =
  "These maps show where a utility serves or where its mains run. They don't guarantee capacity for this lot, a tap permit, or what connecting costs.";

const FRANKLIN_HEALTH = "Franklin County Public Health";

interface Named {
  /** Mid-sentence, with an article where it needs one. */
  prose: string;
}

interface Reading {
  franklin: boolean;
  /** Water and sewer service areas that contain the lot, by source. */
  waterSystems: SourceAnswer<{ name: string; modeled: boolean }[]>;
  sewersheds: SourceAnswer<
    { facility: string; authority?: string; modeled: boolean }[]
  >;
  countyAreas: SourceAnswer<CountyServiceArea[]> | null;
  mains: Record<UtilityKind, MainAnswer[]>;
}

/**
 * Turns the sources' answers into the `utilities` check.
 *
 * - `evidenceFound` only when the lot is inside a mapped water service
 *   area **and** a public sewer main is within ADJACENT_MAIN_M of it.
 * - `unknown` when no source answered at all.
 * - `needsReview` otherwise: some evidence, but a connection is not clearly
 *   available (or part of the question went unanswered).
 */
export function utilitiesCheck(
  parcel: Parcel,
  outcome: UtilitiesOutcome,
  timeoutMs: number,
): Check {
  const reading: Reading = {
    franklin: parcel.countyFips === FRANKLIN_COUNTY_FIPS,
    waterSystems: outcome.waterSystems,
    sewersheds: outcome.sewersheds,
    countyAreas: outcome.countyAreas,
    mains: {
      water: outcome.mains.filter((main) => main.layer.kind === "water"),
      sewer: outcome.mains.filter((main) => main.layer.kind === "sewer"),
    },
  };
  const answered = [
    reading.waterSystems,
    reading.sewersheds,
    ...(reading.countyAreas ? [reading.countyAreas] : []),
    ...outcome.mains.map((main) => main.answer),
  ].filter((answer) => answer.status === "answered");

  if (answered.length === 0) return noAnswer(parcel, outcome, timeoutMs);

  const water = waterPicture(reading);
  const sewer = sewerPicture(reading);
  const adjacentSewer =
    sewer.nearest !== null && sewer.nearest.distanceM <= ADJACENT_MAIN_M;
  const status =
    water.inside && adjacentSewer ? "evidenceFound" : "needsReview";

  const sentences = [
    ...areaSentences(reading, water, sewer),
    ...unmeasuredMains(reading),
  ];
  if (sewer.none) {
    sentences.push(
      water.none ? NO_PUBLIC_SEWER.waterAndSewer : NO_PUBLIC_SEWER.sewer,
    );
  } else if (water.none) {
    sentences.push(
      "No public water is mapped for this lot, so it likely needs a private well.",
    );
  }

  return {
    kind: "utilities",
    status,
    finding: sentences.join(" "),
    limitation: limitation(reading, water, sewer),
    sources: sources(outcome),
    responsibleParty: responsibleParty(reading, water.utility, sewer.utility),
    nextAction: nextAction(reading, water, sewer),
  };
}

interface Picture {
  /** Inside a mapped service area for this utility. */
  inside: boolean;
  /** Nearest kept main on any map that answered, within MAIN_SEARCH_M. */
  nearest: NearestMain | null;
  /**
   * Every source that applies answered, and none puts this service at the
   * lot: no service area, and no main within MAIN_SEARCH_M where a main map
   * covers the area.
   */
  none: boolean;
  /** Who to ask, when a source names someone. */
  utility: Named | null;
}

function nearestOf(answers: MainAnswer[]): NearestMain | null {
  let best: NearestMain | null = null;
  for (const { answer } of answers) {
    if (answer.status !== "answered" || !answer.value) continue;
    if (!best || answer.value.distanceM < best.distanceM) best = answer.value;
  }
  return best;
}

const allAnswered = (answers: MainAnswer[]) =>
  answers.every((main) => main.answer.status === "answered");

function countyAreasFor(reading: Reading, kind: UtilityKind) {
  const areas = reading.countyAreas;
  if (areas?.status !== "answered") return [];
  return areas.value.filter((area) => area.built && area[kind]);
}

function waterPicture(reading: Reading): Picture {
  const systems =
    reading.waterSystems.status === "answered"
      ? reading.waterSystems.value
      : [];
  const county = countyAreasFor(reading, "water");
  const nearest = nearestOf(reading.mains.water);
  const inside = systems.length > 0 || county.length > 0;
  const none =
    !inside &&
    nearest === null &&
    reading.waterSystems.status === "answered" &&
    (reading.countyAreas?.status ?? "answered") === "answered" &&
    allAnswered(reading.mains.water);
  const utility = nearest
    ? named(nearest.owner)
    : county.length > 0
      ? named(FCSE_NAME)
      : systems[0]
        ? named(displayName(systems[0].name))
        : null;
  return { inside, nearest, none, utility };
}

function sewerPicture(reading: Reading): Picture {
  const sheds =
    reading.sewersheds.status === "answered" ? reading.sewersheds.value : [];
  const county = countyAreasFor(reading, "sewer");
  const nearest = nearestOf(reading.mains.sewer);
  const inside = sheds.length > 0 || county.length > 0;
  const none =
    !inside &&
    nearest === null &&
    reading.sewersheds.status === "answered" &&
    (reading.countyAreas?.status ?? "answered") === "answered" &&
    allAnswered(reading.mains.sewer);
  const shed = sheds[0];
  const utility = nearest
    ? named(nearest.owner)
    : county.length > 0
      ? named(FCSE_NAME)
      : shed
        ? named(shed.authority ?? `the operator of ${shed.facility}`)
        : null;
  return { inside, nearest, none, utility };
}

/** The water sentence and the sewer sentence (one, when both are empty). */
function areaSentences(
  reading: Reading,
  water: Picture,
  sewer: Picture,
): string[] {
  const countyNoun = reading.franklin ? `${FCSE_NAME} service area` : null;
  const bothEmpty =
    !water.inside &&
    !sewer.inside &&
    reading.waterSystems.status === "answered" &&
    reading.sewersheds.status === "answered" &&
    (reading.countyAreas?.status ?? "answered") === "answered";
  if (bothEmpty) {
    return [
      sentence(
        `Not inside any community water system or wastewater plant's sewershed on EPA's maps${countyNoun ? `, or any ${countyNoun}` : ""}${mainClause(reading.mains.water, "water", { leading: "; " })}${mainClause(reading.mains.sewer, "sewer", { leading: "; " })}`,
      ),
    ];
  }
  return [waterSentence(reading), sewerSentence(reading)];
}

function waterSentence(reading: Reading): string {
  const systems = reading.waterSystems;
  const lead =
    systems.status === "failed"
      ? "EPA's community water system map didn't answer, so the water service area wasn't checked"
      : systems.value.length === 0
        ? "Not inside any community water system on EPA's map"
        : `Inside the ${list(systems.value.map((system) => displayName(system.name)))} service area${systems.value.length > 1 ? "s" : ""} on EPA's community water system map${modeledNote(
            systems.value.filter((system) => system.modeled).length,
            systems.value.length,
          )}`;
  return serviceSentence(reading, "water", lead, systems);
}

function sewerSentence(reading: Reading): string {
  const sheds = reading.sewersheds;
  const lead =
    sheds.status === "failed"
      ? "EPA's sewershed map didn't answer, so the sewer service area wasn't checked"
      : sheds.value.length === 0
        ? "Not inside any wastewater plant's sewershed on EPA's map"
        : `Inside the ${list(sheds.value.map((shed) => shed.facility))} sewershed${sheds.value.length > 1 ? "s" : ""} on EPA's map${modeledNote(
            sheds.value.filter((shed) => shed.modeled).length,
            sheds.value.length,
          )}`;
  return serviceSentence(reading, "sewer", lead, sheds);
}

/**
 * EPA's answer, then Franklin County Sanitary Engineering's where it adds
 * something (the lot is in one of its areas, or EPA has none either), then
 * the main maps.
 */
function serviceSentence(
  reading: Reading,
  kind: UtilityKind,
  lead: string,
  epa: SourceAnswer<unknown[]>,
): string {
  const epaEmpty = epa.status === "answered" && epa.value.length === 0;
  let text = lead;
  const areas = reading.countyAreas;
  if (areas?.status === "answered") {
    const matching = areas.value.filter((area) => area[kind]);
    if (matching.length > 0) {
      text += `; inside ${list(
        matching.map(
          (area) =>
            `${FCSE_NAME}'s ${displayName(stripNotes(area.name))} ${kind} service area${area.built ? "" : ", which the county marks as not built"}`,
        ),
      )}`;
    } else if (epaEmpty) {
      text += ` or any ${FCSE_NAME} ${kind} service area`;
    }
  } else if (areas?.status === "failed" && epa.status !== "answered") {
    // Nothing else answered for this service; say the county didn't either.
    text += `, and ${FCSE_NAME}'s service area map didn't answer`;
  } else if (areas?.status === "failed" && epaEmpty) {
    text += `; ${FCSE_NAME}'s service area map didn't answer`;
  }
  return sentence(
    `${text}${mainClause(reading.mains[kind], kind, { leading: "; " })}`,
  );
}

/** What the main maps that cover the area say, for one utility. */
function mainClause(
  answers: MainAnswer[],
  kind: UtilityKind,
  { leading }: { leading: string },
): string {
  if (answers.length === 0) return "";
  const noun =
    kind === "water" ? "public water main" : "public sanitary sewer main";
  const nearest = nearestOf(answers);
  if (nearest) {
    const layer = answers.find(
      ({ answer }) => answer.status === "answered" && answer.value === nearest,
    )?.layer;
    const where = layer ? mapCredit(nearest.owner, layer.publisher) : "";
    const far =
      kind === "sewer" && nearest.distanceM > ADJACENT_MAIN_M
        ? ", so connecting may need a sewer extension"
        : "";
    return nearest.distanceM < 1
      ? `${leading}a ${noun} runs along or through the lot (${where})`
      : `${leading}nearest ${noun} about ${metres(nearest.distanceM)} away (${where})${far}`;
  }
  const clauses = answers.map(({ layer, answer }) =>
    answer.status === "answered"
      ? `${possessive(layer.publisher)} ${kind} map shows no ${noun} within ${MAIN_SEARCH_M} m`
      : `${possessive(layer.publisher)} ${kind} map didn't answer`,
  );
  return `${leading}${list(clauses)}`;
}

/** Said when no main map covers the area for water, sewer, or both. */
function unmeasuredMains(reading: Reading): string[] {
  const uncovered = (["water", "sewer"] as const).filter(
    (kind) => reading.mains[kind].length === 0,
  );
  if (uncovered.length === 0) return [];
  const which =
    uncovered.length === 2 ? "water or sewer" : (uncovered[0] ?? "water");
  return [
    `No public ${which} main map is published for this area, so the distance to a main wasn't measured.`,
  ];
}

function limitation(reading: Reading, water: Picture, sewer: Picture): string {
  const parts = [MAPS_ARE_NOT_PERMITS];
  const modeled =
    (reading.waterSystems.status === "answered" &&
      reading.waterSystems.value.some((system) => system.modeled)) ||
    (reading.sewersheds.status === "answered" &&
      reading.sewersheds.value.some((shed) => shed.modeled));
  if (modeled) {
    parts.push(
      "EPA modeled at least one of these boundaries from other data, so its edge is an estimate.",
    );
  }
  const adjacentSewer =
    sewer.nearest !== null && sewer.nearest.distanceM <= ADJACENT_MAIN_M;
  if ((water.inside || sewer.inside) && !adjacentSewer) {
    parts.push(
      "Being inside a service area doesn't mean a main runs to this lot.",
    );
  }
  if (water.none || sewer.none) {
    parts.push(
      "A lot outside every mapped service area can still be served by a line these maps don't show, or by an extension.",
    );
  }
  return parts.join(" ");
}

function responsibleParty(
  reading: Reading,
  water: Named | null,
  sewer: Named | null,
): ResponsibleParty {
  const names = unique([water, sewer]);
  const county = names.some((name) => name.prose === FCSE_NAME);
  return {
    role: "Water and sewer utility",
    ...(names.length > 0
      ? { organization: names.map((name) => bare(name.prose)).join(" and ") }
      : reading.franklin
        ? { organization: FCSE_NAME }
        : {}),
    ...((county || (names.length === 0 && reading.franklin)) && {
      publicContactUrl: FCSE_PAGE,
    }),
  };
}

function nextAction(reading: Reading, water: Picture, sewer: Picture): string {
  const health = reading.franklin
    ? FRANKLIN_HEALTH
    : "the local health district";
  const names = unique([water.utility, sewer.utility]);
  if (names.length === 0) {
    const ask = reading.franklin
      ? FCSE_NAME
      : "the county sanitary engineer or the nearest water and sewer utility";
    return `Ask ${ask} for a water/sewer availability letter before you buy. If neither can reach the lot, ask ${health} about well and septic permits.`;
  }
  const letter =
    water.utility && sewer.utility
      ? "a water and sewer availability letter"
      : water.utility
        ? "a water availability letter"
        : "a sewer availability letter";
  const base = `Ask ${list(names.map((name) => name.prose))} for ${letter} and tap fees before you buy.`;
  if (sewer.none && water.none) {
    return `${base} If neither can reach the lot, ask ${health} about well and septic permits.`;
  }
  if (sewer.none || !sewer.utility) {
    return `${base} If public sewer can't reach the lot, ask ${health} about a septic permit.`;
  }
  if (water.none || !water.utility) {
    return `${base} If public water can't reach the lot, ask ${health} about a well permit.`;
  }
  return base;
}

/** The check when no source answered: who to ask instead. */
function noAnswer(
  parcel: Parcel,
  outcome: UtilitiesOutcome,
  timeoutMs: number,
): Check {
  const franklin = parcel.countyFips === FRANKLIN_COUNTY_FIPS;
  const failures = [
    outcome.waterSystems,
    outcome.sewersheds,
    ...(outcome.countyAreas ? [outcome.countyAreas] : []),
    ...outcome.mains.map((main) => main.answer),
  ];
  const timedOut = failures.every(
    (answer) => answer.status === "failed" && answer.cause === "timedOut",
  );
  const maps = franklin
    ? `EPA's water system and sewershed maps and ${FCSE_NAME}'s service area map`
    : "EPA's water system and sewershed maps";
  const ask = franklin
    ? FCSE_NAME
    : "the county sanitary engineer or the nearest water and sewer utility";
  return {
    kind: "utilities",
    status: "unknown",
    finding: timedOut
      ? `${maps} didn't answer within ${formatSeconds(timeoutMs)}, so water and sewer service weren't checked.`
      : `${maps} couldn't be reached, so water and sewer service weren't checked.`,
    limitation:
      "No conclusion either way: public water and sewer may reach the lot, or it may need a well and a septic system.",
    sources: [],
    responsibleParty: {
      role: "Water and sewer utility",
      ...(franklin && { organization: FCSE_NAME, publicContactUrl: FCSE_PAGE }),
    },
    nextAction: `Ask ${ask} whether public water and sewer reach the lot, and what connecting would cost.`,
  };
}

function sources(outcome: UtilitiesOutcome): Source[] {
  const cited: Source[] = [];
  if (outcome.waterSystems.status === "answered") {
    cited.push({
      authority: "U.S. Environmental Protection Agency",
      title: "Community Water System Service Area Boundaries",
      url: EPA_WATER_SYSTEMS_LAYER,
      retrievedAt: outcome.waterSystems.retrievedAt,
    });
  }
  if (outcome.sewersheds.status === "answered") {
    cited.push({
      authority: "U.S. Environmental Protection Agency",
      title:
        "Sewersheds of publicly owned treatment works (Clean Watersheds Needs Survey 2022)",
      url: EPA_SEWERSHEDS_LAYER,
      retrievedAt: outcome.sewersheds.retrievedAt,
    });
  }
  if (outcome.countyAreas?.status === "answered") {
    cited.push({
      authority: FCSE_NAME,
      title: "Water and sewer service areas",
      url: FCSE_SERVICE_AREAS_LAYER,
      retrievedAt: outcome.countyAreas.retrievedAt,
    });
  }
  for (const { layer, answer } of outcome.mains) {
    if (answer.status !== "answered") continue;
    cited.push({
      authority: layer.publisher,
      title: `${layer.kind === "water" ? "Public water mains" : "Public sanitary sewer mains"} (${layer.title})`,
      url: layer.url,
      retrievedAt: answer.retrievedAt,
    });
  }
  return cited;
}

// ---------- Wording ----------

/** `(City of Grove City)`, or the owner and the map when they differ. */
function mapCredit(owner: string, publisher: string): string {
  return owner === publisher ? owner : `${owner}, on the ${publisher} map`;
}

function possessive(name: string): string {
  return `the ${name}'s`;
}

function named(name: string): Named {
  return {
    prose: /^(the |Franklin County )/.test(name) ? name : `the ${name}`,
  };
}

const bare = (prose: string) => prose.replace(/^the /, "");

function unique(names: (Named | null)[]): Named[] {
  const kept: Named[] = [];
  for (const name of names) {
    if (name && !kept.some((other) => other.prose === name.prose)) {
      kept.push(name);
    }
  }
  return kept;
}

/** `about 15 m`: whole metres under 10, then to the nearest 5 or 10. */
function metres(distance: number): string {
  const rounded =
    distance < 10
      ? Math.max(1, Math.round(distance))
      : distance < 100
        ? Math.round(distance / 5) * 5
        : Math.round(distance / 10) * 10;
  return `${rounded} m`;
}

function modeledNote(modeled: number, total: number): string {
  if (modeled === 0) return "";
  return total === 1 || modeled === total
    ? ` (a boundary EPA modeled)`
    : ` (EPA modeled ${modeled} of these boundaries)`;
}

/** `HARRISBURG (O&M ONLY)` → `HARRISBURG`. */
function stripNotes(name: string): string {
  return name.replace(/\s*\((NOT BUILT|O&M ONLY)\)\s*$/i, "").trim();
}

/** Kept upper case when EPA or the county writes a name in capitals. */
const ACRONYMS = new Set([
  "FC",
  "II",
  "III",
  "IV",
  "LLC",
  "MHP",
  "OH",
  "PWS",
  "RWD",
  "USA",
  "WSD",
  "WTP",
  "WWTP",
]);

/** `COLUMBUS PUBLIC WATER SYSTEM` → `Columbus Public Water System`; mixed case is kept. */
export function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const core = word.replace(/[^A-Z0-9]/g, "");
      if (ACRONYMS.has(core) || /\d/.test(word)) return word;
      return word
        .toLowerCase()
        .replace(
          /(^|[-/(&.'])([a-z])/g,
          (_m, lead: string, letter: string) =>
            `${lead}${letter.toUpperCase()}`,
        );
    })
    .join(" ");
}

function sentence(text: string): string {
  const trimmed = text.trim();
  const capital = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
