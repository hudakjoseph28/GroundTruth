/**
 * A parcel's site address, made readable. The API already answers one clean,
 * title-cased address ("10034 Appleton Rd, Johnstown, OH 43031"); this adds
 * the one thing left for the page, a vacant lot's house number 0. It still
 * tidies a county record in capitals, as the bundled fixtures and an older
 * API response carry. This changes how the address is shown, never which
 * parcel it is.
 */
export interface SiteAddress {
  /** For example "93 Woody Knoll Dr, Thornville, OH 43076" or "Seaman Rd". */
  text: string;
  /** True when the record's house number is 0: the lot has no street number. */
  noHouseNumber: boolean;
  /** The address as the API gave it, with its house number. */
  published: string;
}

const KEEP_UPPER = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "OH", "US", "SR", "CR", "TR", "PO"]);

function titleWord(word: string): string {
  if (KEEP_UPPER.has(word)) return word;
  // "9TH" reads "9th"; "MAIN" reads "Main"; "O'NEIL" and "SMITH-JONES" keep their parts.
  if (/^\d/.test(word)) return word.toLowerCase();
  return word
    .toLowerCase()
    .replace(/(^|['-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

export function formatSiteAddress(published: string | undefined): SiteAddress | null {
  let text = (published ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const original = text;

  // "… DR THORNVILLE, OH 43076 THORNVILLE 43076": the city and ZIP given
  // twice. The repeat shows where the street ends and the city begins.
  text = text.replace(
    /^(.*?)[, ]+([A-Z][A-Z .'-]*), ?OH (\d{5})(?:-\d{4})? \2 \3$/i,
    "$1, $2, OH $3",
  );

  const noHouseNumber = /^0+ /.test(text);
  if (noHouseNumber) text = text.replace(/^0+ /, "");

  // Mixed case is the API's own cleaning ("McDaniel", "SR 73"): keep it.
  if (!/[a-z]/.test(text)) {
    text = text
      .split(" ")
      .map((part) => {
        const [, word = part, tail = ""] = /^(.*?)(,?)$/.exec(part) ?? [];
        return titleWord(word) + tail;
      })
      .join(" ");
  }

  return { text, noHouseNumber, published: original };
}

/**
 * The name a parcel page uses, whatever was typed to find it.
 * A published street is the name. The county parcel ID is the name when
 * Ohio published no street. Two lots can share a street, so the ID stays
 * on the page either way.
 */
export interface ParcelName {
  /** Street line, such as "84 W Dodridge St" or "Seaman Rd". Null when none is published. */
  street: string | null;
  /** "Thornville, OH 43076" when the record includes a place after the street. */
  locality: string | null;
  noHouseNumber: boolean;
  /** The address as the API gave it. */
  published: string | null;
}

const PARCEL_KEY = /^ohio:[0-9]{5}:(.+)$/;

/** The local parcel ID inside an `ohio:{fips}:{id}` key, or null. */
export function parcelIdFromKey(key: string): string | null {
  const id = PARCEL_KEY.exec(key)?.[1];
  return id ? id : null;
}

export function parcelName(siteAddress: string | undefined): ParcelName {
  const formatted = formatSiteAddress(siteAddress);
  if (!formatted) {
    return { street: null, locality: null, noHouseNumber: false, published: null };
  }
  const comma = formatted.text.indexOf(",");
  const street = (comma === -1 ? formatted.text : formatted.text.slice(0, comma)).trim();
  const locality = comma === -1 ? null : formatted.text.slice(comma + 1).trim() || null;
  if (!street) {
    return { street: null, locality: null, noHouseNumber: false, published: formatted.published };
  }
  return {
    street,
    locality,
    noHouseNumber: formatted.noHouseNumber,
    published: formatted.published,
  };
}
