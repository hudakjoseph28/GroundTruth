import { OHIO_PLACE_COUNTIES } from "./ohioPlaces.js";

/**
 * A parcel's published site address (`SitusAddressAll`), cleaned for display.
 *
 * Ohio's counties publish this field in capitals, padded with spaces, and in
 * several layouts (sampled across 24 counties on 2026-11-18):
 *
 *   Licking    `10034 APPLETON RD JOHNSTOWN, OH 43031 JOHNSTOWN 43031`
 *   Cuyahoga   `4911  TILLMAN AVE  CLEVELAND 44102`
 *   Vinton     `68475 PRATTSVILLE RD MC ARTHUR 45651`
 *   Franklin   `84 W DODRIDGE ST   `
 *   Wyandot    `310 W  CHURCH                 ST  `
 *
 * The result reads `10034 Appleton Rd, Johnstown, OH 43031`: one copy of the
 * city and ZIP, title case, single spaces. No word is added except `OH`,
 * which holds for every parcel in Ohio's statewide layer, and none is
 * dropped except a repeated city and ZIP. A comma goes between street and
 * city only where the county repeats the city, separates it with a wider
 * gap, or the street ends in a known Ohio place name (the longest one, so
 * `… WEST UNION 45693` reads as West Union). Otherwise the words stay
 * exactly in the order published.
 *
 * Search still matches on the published text, and the published record stays
 * one request away at the parcel's `geometry.sourceUrl`.
 */
export function cleanSiteAddress(
  published: string | null | undefined,
): string | undefined {
  const raw = (published ?? "").trim().toUpperCase();
  const collapsed = raw.replace(/\s+/g, " ");
  // Blank, or only the 0 that stands for "no house number" (`0      `).
  if (!collapsed || /^0+$/.test(collapsed)) return undefined;

  const parts = splitPlace(raw, collapsed);
  if (!parts) return titleCase(collapsed);
  const place = `${titleCase(parts.city)}, OH ${parts.zip}`;
  const street = titleCase(stripTrailingComma(parts.street));
  // `0     OREGON 43616`: no street is published, only where the lot is.
  return /^0*$/.test(street) ? place : `${street}, ${place}`;
}

interface AddressParts {
  street: string;
  city: string;
  zip: string;
}

const ZIP = String.raw`(\d{5}(?:-\d{4})?)`;
const CITY = String.raw`([A-Z][A-Z .'-]*?)`;
/** `… JOHNSTOWN, OH 43031 JOHNSTOWN 43031`: the repeat marks the city. */
const REPEATED = new RegExp(`^(.*?)[, ]+${CITY}, ?OH ${ZIP} \\2 \\3$`);
/** `… JOHNSTOWN, OH 43031`, or `… JOHNSTOWN OH 43031`. */
const WITH_STATE = new RegExp(`^(.+?),? OH ${ZIP}$`);
/** `… CLEVELAND 44102`. */
const WITH_ZIP = new RegExp(`^(.+) ${ZIP}$`);
/** The longest city name looked for at the end of a street: `NORTH LIMA`. */
const MAX_PLACE_WORDS = 4;

function splitPlace(raw: string, collapsed: string): AddressParts | null {
  const repeated = REPEATED.exec(collapsed);
  if (repeated) {
    const [, street = "", city = "", zip = ""] = repeated;
    return { street, city, zip };
  }

  const withState = WITH_STATE.exec(collapsed);
  const withZip = withState ?? WITH_ZIP.exec(collapsed);
  if (!withZip) return null;
  const [, head = "", zip = ""] = withZip;

  // A wider gap before the city is the county's own field boundary:
  // `4911  TILLMAN AVE  CLEVELAND 44102`. Counties also pad the house
  // number (`0  LEYDEN LN REAR HUBER HEIGHTS 45424`), so the part before
  // the gap must hold a street word, not only a number.
  if (!withState) {
    const fields = raw.split(/\s{2,}/);
    const last = fields[fields.length - 1] ?? "";
    const tail = WITH_ZIP.exec(last.replace(/\s+/g, " "));
    const street = fields.slice(0, -1).join(" ").replace(/\s+/g, " ");
    if (
      tail &&
      /(^| )[A-Z]/.test(street) &&
      /^[A-Z][A-Z .'-]*$/.test(tail[1] ?? "")
    ) {
      return { street, city: tail[1] ?? "", zip };
    }
  }

  // Otherwise the city is the longest known Ohio place name the street ends
  // with. The street must keep at least one word of its own.
  const words = head.replace(/,/g, " ").split(" ").filter(Boolean);
  for (
    let size = Math.min(MAX_PLACE_WORDS, words.length - 1);
    size > 0;
    size -= 1
  ) {
    const city = words.slice(-size);
    if (isOhioPlace(city)) {
      return {
        street: words.slice(0, -size).join(" "),
        city: city.join(" "),
        zip,
      };
    }
  }
  return null;
}

/** Counties publish `MT PERRY`, `MC ARTHUR`, `ST CLAIRSVILLE`; the Census spells them out. */
function isOhioPlace(words: readonly string[]): boolean {
  if (words.some((word) => !/^[A-Z][A-Z.'-]*$/.test(word))) return false;
  const name = words.join(" ").replace(/[.']/g, "");
  return [
    name,
    name.replace(/^MT /, "MOUNT "),
    name.replace(/^MC /, "MC"),
    name.replace(/^SAINT /, "ST "),
  ].some((candidate) => Object.hasOwn(OHIO_PLACE_COUNTIES, candidate));
}

function stripTrailingComma(value: string): string {
  return value.replace(/[, ]+$/, "");
}

/** Words that stay in capitals: compass points, `OH`, `US`, and numerals. */
const KEEP_UPPER = new Set([
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
  "OH",
  "US",
  "II",
  "III",
  "IV",
]);
/**
 * Route labels stay in capitals before their number (`SR 315`, `CR 12`,
 * `TR 45`). Anywhere else the same letters are a street type: Franklin
 * publishes `FAIRWAY CR` for a circle.
 */
const ROUTE_LABELS = new Set(["SR", "CR", "TR"]);

function titleCase(value: string): string {
  const parts = value.split(" ").filter(Boolean);
  return parts
    .map((part, index) => {
      const comma = part.endsWith(",") ? "," : "";
      const word = comma ? part.slice(0, -1) : part;
      const route =
        ROUTE_LABELS.has(word) && /^\d/.test(parts[index + 1] ?? "");
      return (route ? word : titleWord(word)) + comma;
    })
    .join(" ");
}

function titleWord(word: string): string {
  if (KEEP_UPPER.has(word)) return word;
  // A number keeps its form, except an ordinal: `9TH` reads `9th`.
  if (/^\d/.test(word)) {
    return /^\d+(ST|ND|RD|TH)$/.test(word) ? word.toLowerCase() : word;
  }
  // Each part of `GREEN-COOK` and `O'NEIL` gets its own capital.
  return word
    .toLowerCase()
    .replace(
      /(^|[-'(/])([a-z])/g,
      (_, lead: string, letter: string) => lead + letter.toUpperCase(),
    )
    .replace(
      /^Mc([a-z])(?=[a-z]{2})/,
      (_, letter: string) => `Mc${letter.toUpperCase()}`,
    );
}
