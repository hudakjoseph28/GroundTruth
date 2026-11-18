/**
 * A parcel's published site address, made readable. County records come in
 * capitals, some repeat the city and ZIP, and a vacant lot often has the house
 * number 0. This changes how the address is shown, never which parcel it is:
 * the record's own text stays available as `published`.
 */
export interface SiteAddress {
  /** For example "93 Woody Knoll Dr, Thornville, OH 43076" or "Seaman Rd". */
  text: string;
  /** True when the record's house number is 0: the lot has no street number. */
  noHouseNumber: boolean;
  /** The address exactly as the county published it. */
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

  text = text
    .split(" ")
    .map((part) => {
      const [, word = part, tail = ""] = /^(.*?)(,?)$/.exec(part) ?? [];
      return titleWord(word.toUpperCase()) + tail;
    })
    .join(" ");

  return { text, noHouseNumber, published: original };
}
