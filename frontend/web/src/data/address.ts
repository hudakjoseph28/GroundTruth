/**
 * A published site address, made readable. OGRIP publishes addresses in
 * capitals, sometimes with the city, state, and ZIP repeated
 * (`10034 APPLETON RD JOHNSTOWN, OH 43031 JOHNSTOWN 43031`), and vacant lots
 * with house number 0 (`0 SEAMAN RD`). Nothing is added that the record does
 * not say: Franklin County publishes no city, so none is shown.
 */
export interface DisplayAddress {
  /** `84 W Dodridge St`, `10034 Appleton Rd Johnstown, OH 43031`, `Seaman Rd`. */
  line: string;
  /** The record gives house number 0: a lot with no street number. */
  noHouseNumber: boolean;
}

const UPPER = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "OH", "SR", "US", "CR", "TR"]);

export function displayAddress(raw: string | undefined): DisplayAddress | null {
  let text = raw?.replace(/\s+/g, " ").trim() ?? "";
  // Keep everything through the first `, OH 12345`; what follows repeats it.
  const stateZip = /^(.*?,\s*OH\s+\d{5}(?:-\d{4})?)\b/i.exec(text);
  if (stateZip?.[1]) text = stateZip[1];
  const noHouseNumber = /^0+\s/.test(text);
  if (noHouseNumber) text = text.replace(/^0+\s+/, "");
  if (!text) return null;
  return { line: text.split(" ").map(word).join(" "), noHouseNumber };
}

function word(value: string): string {
  const trailing = value.endsWith(",") ? "," : "";
  const bare = trailing ? value.slice(0, -1) : value;
  const upper = bare.toUpperCase();
  if (UPPER.has(upper)) return upper + trailing;
  if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return upper.toLowerCase() + trailing;
  if (/\d/.test(bare)) return upper + trailing;
  const titled = bare
    .toLowerCase()
    .replace(/(^|[-'/])([a-z])/g, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
  return titled + trailing;
}
