import { OHIO_PLACE_COUNTIES } from "./ohioPlaces.js";

/** USPS street suffixes common in Ohio situs addresses. */
const STREET_SUFFIXES = new Set([
  "ALY",
  "AVE",
  "AV",
  "AVENUE",
  "BLVD",
  "BOULEVARD",
  "CIR",
  "CIRCLE",
  "CT",
  "COURT",
  "CV",
  "DR",
  "DRIVE",
  "EXPY",
  "HWY",
  "HIGHWAY",
  "LN",
  "LANE",
  "LOOP",
  "PATH",
  "PIKE",
  "PK",
  "PKWY",
  "PARKWAY",
  "PL",
  "PLACE",
  "PLZ",
  "RD",
  "ROAD",
  "ROW",
  "RUN",
  "SQ",
  "ST",
  "STREET",
  "TER",
  "TERRACE",
  "TPKE",
  "TRL",
  "TRAIL",
  "WALK",
  "WAY",
  "XING",
]);
const DIRECTIONS = new Set([
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
  "NORTH",
  "SOUTH",
  "EAST",
  "WEST",
]);
/** Spelled-out and abbreviated directions, to the USPS abbreviation. */
const DIRECTION_CANON: Readonly<Record<string, string>> = {
  N: "N",
  NORTH: "N",
  S: "S",
  SOUTH: "S",
  E: "E",
  EAST: "E",
  W: "W",
  WEST: "W",
  NE: "NE",
  NORTHEAST: "NE",
  NW: "NW",
  NORTHWEST: "NW",
  SE: "SE",
  SOUTHEAST: "SE",
  SW: "SW",
  SOUTHWEST: "SW",
};
/** Street suffixes that have more than one spelling, to the USPS form. */
const SUFFIX_CANON: Readonly<Record<string, string>> = {
  AV: "AVE",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  CIRCLE: "CIR",
  COURT: "CT",
  DRIVE: "DR",
  HIGHWAY: "HWY",
  LANE: "LN",
  PARKWAY: "PKWY",
  PK: "PIKE",
  PLACE: "PL",
  ROAD: "RD",
  STREET: "ST",
  TERRACE: "TER",
  TRAIL: "TRL",
};
const OHIO = new Set(["OH", "OHIO"]);
const UNIT_WORDS = new Set([
  "APT",
  "UNIT",
  "STE",
  "SUITE",
  "LOT",
  "BLDG",
  "FL",
  "RM",
  "#",
]);
const OTHER_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS " +
    "MO MT NE NV NH NJ NM NY NC ND OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR"
  ).split(" "),
);
const ZIP = /^\d{5}(-\d{4})?$/;
/** More counties than this and a place name is too ambiguous to scope by. */
export const MAX_PLACE_COUNTIES = 3;

export interface AddressQuery {
  /** Digits, or `""` for a street typed with no house number. */
  houseNumber: string;
  /** Street name without house number, direction, or suffix: `MAIN`. */
  streetName: string;
  /**
   * `57 S MAIN ST`: the query without city, state, or ZIP, with spelled-out
   * directions and suffixes abbreviated (`North High Street` → `N HIGH ST`).
   * A street query has no number here: `SEAMAN RD`.
   */
  streetOnly: string;
  /** Typed direction, abbreviated (`N`), before or after the street name. */
  direction?: string;
  /** Typed street suffix, in USPS form (`ST`, `AVE`, `RD`). */
  suffix?: string;
  /**
   * The street and place with directions and suffixes abbreviated, for the
   * locator, which reads a spelled-out `South` as a street named SOUTH. Set
   * only when it differs from what was typed.
   */
  abbreviated?: string;
  /** City, village, or township as typed, normalized: `JOHNSTOWN`. */
  place?: string;
  /** The query names a state other than Ohio. */
  outOfState: boolean;
}

/**
 * Splits a typed address into house number, street, and place. Returns null
 * without a leading house number; `parseStreetQuery` reads those.
 */
export function parseAddressQuery(query: string): AddressQuery | null {
  const segments = querySegments(query);
  const houseNumber = segments[0]?.[0];
  if (!houseNumber || !/^\d+$/.test(houseNumber)) return null;
  return parseSegments(segments, houseNumber);
}

/**
 * Reads a street typed with no house number: `Seaman Rd`, `W Dodridge St`,
 * `Seaman Rd, Galloway`. Returns null when the query starts with a number
 * (an ordinal such as `5th Ave` is a name, not a number) or holds no street
 * name. A place name alone is not a street: see `placeOnlyQuery`.
 */
export function parseStreetQuery(query: string): AddressQuery | null {
  const segments = querySegments(query);
  const lead = segments[0]?.[0] ?? "";
  if (!/^([A-Z]|\d+(ST|ND|RD|TH)$)/.test(lead)) return null;
  return parseSegments(segments, "");
}

/**
 * The place a query names when it names nothing else: `Columbus`,
 * `Mount Vernon, OH`, `Johnstown 43031`. A street cannot be searched from a
 * city alone, so the caller asks for a street or a parcel ID. Returns the
 * place in the Census spelling, or null when the query is not just a place.
 */
export function placeOnlyQuery(query: string): string | null {
  const tokens = words(query.toUpperCase().replace(/,/g, " "));
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1] ?? "";
    if (!ZIP.test(last) && !OHIO.has(last)) break;
    tokens.pop();
  }
  if (tokens.length === 0 || tokens.some((token) => /\d/.test(token))) {
    return null;
  }
  const place = normalizePlaceName(tokens.join(" "));
  return placeCounties(place).length > 0 ? place : null;
}

function querySegments(query: string): string[][] {
  return query
    .toUpperCase()
    .split(",")
    .map((segment) => words(segment))
    .filter((segment) => segment.length > 0);
}

/** `houseNumber` is the first word of the first segment, or `""` for none. */
function parseSegments(
  segments: string[][],
  houseNumber: string,
): AddressQuery | null {
  const first = segments[0] ?? [];
  const lead = houseNumber ? 1 : 0;

  let street: string[];
  let rest: string[];
  if (segments.length > 1) {
    street = first.slice(lead);
    rest = segments.slice(1).flat();
  } else {
    const tokens = first.slice(lead);
    let end = -1;
    tokens.forEach((token, index) => {
      if (index > 0 && STREET_SUFFIXES.has(token)) end = index;
    });
    street = end >= 0 ? tokens.slice(0, end + 1) : tokens;
    rest = end >= 0 ? tokens.slice(end + 1) : [];
  }

  let outOfState = false;
  while (rest.length > 0) {
    const last = rest[rest.length - 1] ?? "";
    if (ZIP.test(last) || OHIO.has(last)) {
      rest = rest.slice(0, -1);
    } else if (OTHER_STATES.has(last)) {
      outOfState = true;
      rest = rest.slice(0, -1);
    } else {
      break;
    }
  }
  if (segments.length === 1) {
    while (street.length > 1 && ZIP.test(street[street.length - 1] ?? "")) {
      street = street.slice(0, -1);
    }
  }

  const parts = streetParts(street);
  const core = parts.core.filter((word) => /^[A-Z0-9][A-Z0-9'-]*$/.test(word));
  if (core.length === 0) return null;
  const place =
    rest.length > 0 ? normalizePlaceName(rest.join(" ")) : undefined;
  const direction = parts.predir ?? parts.postdir;
  const streetOnly = [
    houseNumber,
    parts.predir,
    ...parts.core,
    parts.suffix,
    parts.postdir,
  ]
    .filter(Boolean)
    .join(" ");
  const typed = [houseNumber, ...street].filter(Boolean).join(" ");
  return {
    houseNumber,
    streetName: core.join(" "),
    streetOnly,
    ...(place ? { place } : {}),
    outOfState,
    ...(direction ? { direction } : {}),
    ...(parts.suffix ? { suffix: parts.suffix } : {}),
    ...(streetOnly !== typed
      ? { abbreviated: place ? `${streetOnly}, ${place}` : streetOnly }
      : {}),
  };
}

interface StreetParts {
  predir?: string;
  core: string[];
  suffix?: string;
  postdir?: string;
}

/**
 * Splits street words into direction, name, suffix, and trailing direction,
 * in canonical form. A word is a direction or suffix only if a name word
 * remains: `NORTH ST` is a street named NORTH, not a direction.
 */
function streetParts(street: string[]): StreetParts {
  const core = [...street];
  const parts: StreetParts = { core };
  const last = () => core[core.length - 1] ?? "";
  if (core.length > 1 && DIRECTIONS.has(last())) {
    parts.postdir = canonicalDirection(core.pop() ?? "");
  }
  if (core.length > 1 && STREET_SUFFIXES.has(last())) {
    parts.suffix = canonicalSuffix(core.pop() ?? "");
  }
  if (core.length > 1 && DIRECTIONS.has(core[0] ?? "")) {
    parts.predir = canonicalDirection(core.shift() ?? "");
  }
  return parts;
}

function canonicalDirection(word: string): string {
  return DIRECTION_CANON[word] ?? word;
}

function canonicalSuffix(word: string): string {
  return SUFFIX_CANON[word] ?? word;
}

/**
 * Whether a published site address agrees with the direction and suffix a
 * buyer typed. A typed direction must equal the published one, before or
 * after the street name (`1739 N HIGH ST` is not `1739 S HIGH ST`); a typed
 * suffix must equal the published suffix. With nothing typed, any direction
 * or suffix is accepted, so `1739 High St` matches both N and S High.
 */
export function siteAddressAgrees(
  siteAddress: string,
  streetName: string,
  wanted: Pick<AddressQuery, "direction" | "suffix">,
): boolean {
  if (!wanted.direction && !wanted.suffix) return true;
  const tokens = words(siteAddress.toUpperCase().replace(/,/g, " "));
  const street = words(streetName.toUpperCase());
  let at = -1;
  for (let i = 1; i + street.length <= tokens.length; i += 1) {
    if (street.every((word, k) => tokens[i + k] === word)) {
      at = i;
      break;
    }
  }
  if (at < 0) return false;
  const before = tokens[at - 1] ?? "";
  const predir =
    at >= 2 && DIRECTIONS.has(before) ? canonicalDirection(before) : undefined;
  let next = at + street.length;
  let suffix: string | undefined;
  let postdir: string | undefined;
  if (STREET_SUFFIXES.has(tokens[next] ?? "")) {
    suffix = canonicalSuffix(tokens[next] ?? "");
    next += 1;
  }
  if (DIRECTIONS.has(tokens[next] ?? "")) {
    postdir = canonicalDirection(tokens[next] ?? "");
  }
  if (wanted.direction && (predir ?? postdir) !== wanted.direction)
    return false;
  if (wanted.suffix && suffix !== wanted.suffix) return false;
  return true;
}

function words(value: string): string[] {
  return value.split(/\s+/).filter((word) => word.length > 0);
}

export function normalizePlaceName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\bMT\b/g, "MOUNT")
    .replace(/\bSAINT\b/g, "ST")
    .replace(/\s+/g, " ")
    .trim();
}

/** Counties a place name lies in (Census 2020), or [] if unknown. */
export function placeCounties(place: string): readonly string[] {
  return OHIO_PLACE_COUNTIES[normalizePlaceName(place)] ?? [];
}

/**
 * Whether a published site address names the typed place. Many counties
 * publish the city (`10034 APPLETON RD JOHNSTOWN, OH 43031`); Franklin does
 * not (`84 W DODRIDGE ST`). Returns `named` when the typed place appears
 * after the street, `absent` when no city is published, and `other` when a
 * different city is.
 */
export function sitePlace(
  siteAddress: string,
  streetName: string,
  place: string,
): "named" | "absent" | "other" {
  const tokens = words(siteAddress.toUpperCase().replace(/,/g, " "));
  const street = words(streetName);
  let after = tokens.length;
  for (let i = 0; i + street.length <= tokens.length; i += 1) {
    if (street.every((word, k) => tokens[i + k] === word)) {
      after = i + street.length;
      break;
    }
  }
  const remainder = tokens
    .slice(after)
    .filter(
      (t) =>
        !STREET_SUFFIXES.has(t) &&
        !DIRECTIONS.has(t) &&
        !OHIO.has(t) &&
        !UNIT_WORDS.has(t) &&
        !/^#?\d/.test(t),
    )
    .map((t) => normalizePlaceName(t))
    .join(" ");
  if (remainder === "") return "absent";
  return ` ${remainder} `.includes(` ${place} `) ? "named" : "other";
}
