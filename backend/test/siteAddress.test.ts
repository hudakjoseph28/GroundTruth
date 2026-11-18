// cleanSiteAddress against `SitusAddressAll` values exactly as OGRIP published
// them. Each input is in a recording under test/fixtures/ogrip, or was read
// from the live layer on 2026-11-18 (marked "live").
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanSiteAddress } from "../src/parcels/siteAddress.js";

describe("cleanSiteAddress", () => {
  it.each([
    // Licking repeats the city and ZIP.
    [
      "10034 APPLETON RD JOHNSTOWN, OH 43031 JOHNSTOWN 43031",
      "10034 Appleton Rd, Johnstown, OH 43031",
    ],
    [
      "57 S MAIN ST JOHNSTOWN, OH 43031 JOHNSTOWN 43031",
      "57 S Main St, Johnstown, OH 43031",
    ],
    [
      "123 VALLEY VIEW DR JOHNSTOWN, OH 43031 JOHNSTOWN 43031",
      "123 Valley View Dr, Johnstown, OH 43031",
    ],
    [
      "57 W MAIN ST ALEXANDRIA, OH 43001 ALEXANDRIA 43001",
      "57 W Main St, Alexandria, OH 43001",
    ],
    // The second-county demo parcel (live).
    [
      "93 WOODY KNOLL DR THORNVILLE, OH 43076 THORNVILLE 43076",
      "93 Woody Knoll Dr, Thornville, OH 43076",
    ],
  ])("gives one copy of a repeated city and ZIP: %s", (published, clean) => {
    expect(cleanSiteAddress(published)).toBe(clean);
  });

  it.each([
    // Franklin publishes no city, and pads the end.
    ["84 W DODRIDGE ST   ", "84 W Dodridge St"],
    ["0  SEAMAN RD   ", "0 Seaman Rd"],
    ["1739 S PARSONS AV   ", "1739 S Parsons Av"],
    ["0 E FIFTH AV   ", "0 E Fifth Av"],
    // Wyandot pads inside the street (live).
    ["310 W  CHURCH                 ST  ", "310 W Church St"],
  ])("adds no city where the county publishes none: %s", (published, clean) => {
    expect(cleanSiteAddress(published)).toBe(clean);
  });

  it.each([
    // Lucas and Montgomery separate the city with a wider gap.
    ["0  SEAMAN RD  OREGON 43616", "0 Seaman Rd, Oregon, OH 43616"],
    ["7522  SEAMAN RD  TOLEDO 43616", "7522 Seaman Rd, Toledo, OH 43616"],
    [
      "0  BRANDT PIKE  HUBER HEIGHTS 45424",
      "0 Brandt Pike, Huber Heights, OH 45424",
    ],
    [
      "0  KITTYHAWK COMMONS   DAYTON 45424",
      "0 Kittyhawk Commons, Dayton, OH 45424",
    ],
    // Cuyahoga (live).
    [
      "4911  TILLMAN AVE  CLEVELAND 44102",
      "4911 Tillman Ave, Cleveland, OH 44102",
    ],
    // Adams (live): a state route, and a two-word village.
    ["5700  SR 73   WEST UNION 45693", "5700 SR 73, West Union, OH 45693"],
    ["SR 73   WEST UNION 45693", "SR 73, West Union, OH 45693"],
    [
      "202  GRACES RUN RD  WEST UNION 45693",
      "202 Graces Run Rd, West Union, OH 45693",
    ],
  ])("splits street and city at the county's gap: %s", (published, clean) => {
    expect(cleanSiteAddress(published)).toBe(clean);
  });

  it.each([
    // No gap before the city: it is the Ohio place name the street ends with.
    [
      "0  LEYDEN LN REAR HUBER HEIGHTS 45424",
      "0 Leyden Ln Rear, Huber Heights, OH 45424",
    ],
    [
      "0  OLD TROY PIKE A HUBER HEIGHTS 45424",
      "0 Old Troy Pike A, Huber Heights, OH 45424",
    ],
    // Vinton (live) publishes McArthur as two words.
    [
      "68475 PRATTSVILLE RD MC ARTHUR 45651",
      "68475 Prattsville Rd, Mc Arthur, OH 45651",
    ],
  ])(
    "finds a city that follows the street directly: %s",
    (published, clean) => {
      expect(cleanSiteAddress(published)).toBe(clean);
    },
  );

  it("keeps a lot's place when no street is published", () => {
    expect(cleanSiteAddress("0     OREGON 43616")).toBe("Oregon, OH 43616");
  });

  it.each(["", "   ", "0", "0      ", null, undefined])(
    "has no address for %j",
    (published) => {
      expect(cleanSiteAddress(published)).toBeUndefined();
    },
  );

  it.each([
    // A street type that is also a route label (Franklin's circle).
    ["0  FAIRWAY CR   ", "0 Fairway Cr"],
    ["0  MCDANIEL RDG  DAYTON 45424", "0 McDaniel Rdg, Dayton, OH 45424"],
    ["0  NORTH TEAL LN  OREGON 43616", "0 North Teal Ln, Oregon, OH 43616"],
    ["0 N LALLENDORF RD  OREGON 43616", "0 N Lallendorf Rd, Oregon, OH 43616"],
  ])("title-cases %s", (published, clean) => {
    expect(cleanSiteAddress(published)).toBe(clean);
  });

  it("is unchanged by a second pass", () => {
    for (const published of recordedSiteAddresses()) {
      const clean = cleanSiteAddress(published);
      if (clean) expect(cleanSiteAddress(clean)).toBe(clean);
    }
  });

  it("keeps every published word, in order, and adds only OH", () => {
    const published = recordedSiteAddresses();
    expect(published.length).toBeGreaterThan(200);
    for (const raw of published) {
      const clean = cleanSiteAddress(raw);
      if (!clean) continue;
      const cleanWords = wordsOf(clean);
      const rawWords = wordsOf(raw);
      expect(clean).not.toMatch(/\s{2,}|^\s|\s$/);

      // Walk both lists: the cleaned words are the published ones in order,
      // less a leading 0 with no street, a repeated city and ZIP, and the
      // county's own OH, plus the one OH this adds before a ZIP.
      const withoutState = (words: string[]) =>
        words.filter((word) => word !== "OH");
      const kept = withoutState(cleanWords);
      const source = withoutState(rawWords);
      let at = 0;
      for (const word of kept) {
        const found = source.indexOf(word, at);
        expect(found, `${raw} -> ${clean}`).toBeGreaterThanOrEqual(0);
        at = found + 1;
      }
      const dropped = source.length - kept.length;
      const repeatsCityAndZip = /, ?OH \d{5}/.test(raw.toUpperCase());
      if (!repeatsCityAndZip) {
        // Only a lone leading 0 may go.
        expect(dropped, `${raw} -> ${clean}`).toBeLessThanOrEqual(
          source[0] === "0" && kept[0] !== "0" ? 1 : 0,
        );
      }
    }
  });
});

function wordsOf(value: string): string[] {
  return value.toUpperCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
}

/** Every distinct `SitusAddressAll` in the recorded OGRIP responses. */
function recordedSiteAddresses(): string[] {
  const dir = new URL("./fixtures/ogrip/", import.meta.url);
  const seen = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const recording = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as {
      exchanges?: {
        body?: { features?: { attributes?: { SitusAddressAll?: unknown } }[] };
      }[];
    };
    for (const exchange of recording.exchanges ?? []) {
      for (const feature of exchange.body?.features ?? []) {
        const situs = feature.attributes?.SitusAddressAll;
        if (typeof situs === "string") seen.add(situs);
      }
    }
  }
  return [...seen];
}
