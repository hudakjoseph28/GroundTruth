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
  houseNumber: string;
  /** Street name without house number, direction, or suffix: `MAIN`. */
  streetName: string;
  /** `57 S MAIN ST`: the query without city, state, or ZIP. */
  streetOnly: string;
  /** City, village, or township as typed, normalized: `JOHNSTOWN`. */
  place?: string;
  /** The query names a state other than Ohio. */
  outOfState: boolean;
}

/**
 * Splits a typed address into house number, street, and place. Returns null
 * without a leading house number: a parcel's site address can only be
 * matched on number + street.
 */
export function parseAddressQuery(query: string): AddressQuery | null {
  const segments = query
    .toUpperCase()
    .split(",")
    .map((segment) => words(segment))
    .filter((segment) => segment.length > 0);
  const first = segments[0] ?? [];
  const houseNumber = first[0];
  if (!houseNumber || !/^\d+$/.test(houseNumber)) return null;

  let street: string[];
  let rest: string[];
  if (segments.length > 1) {
    street = first.slice(1);
    rest = segments.slice(1).flat();
  } else {
    const tokens = first.slice(1);
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

  const core = coreStreet(street);
  if (core.length === 0) return null;
  const place =
    rest.length > 0 ? normalizePlaceName(rest.join(" ")) : undefined;
  return {
    houseNumber,
    streetName: core.join(" "),
    streetOnly: [houseNumber, ...street].join(" "),
    ...(place ? { place } : {}),
    outOfState,
  };
}

function coreStreet(street: string[]): string[] {
  let core = [...street];
  if (core.length > 1 && DIRECTIONS.has(core[0] ?? "")) core = core.slice(1);
  if (core.length > 1 && DIRECTIONS.has(core[core.length - 1] ?? "")) {
    core = core.slice(0, -1);
  }
  if (core.length > 1 && STREET_SUFFIXES.has(core[core.length - 1] ?? "")) {
    core = core.slice(0, -1);
  }
  return core.filter((word) => /^[A-Z0-9][A-Z0-9'-]*$/.test(word));
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
