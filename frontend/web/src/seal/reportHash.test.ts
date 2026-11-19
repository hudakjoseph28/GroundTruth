import { describe, expect, it } from "vitest";
import {
  MEMO_PROGRAM_ID,
  goldenReport,
  secondCountyReport,
  type ParcelReport,
} from "@groundtruth/shared";
import {
  REPORT_MEMO_PREFIX,
  canonicalJson,
  parseReportMemo,
  reportCanonicalJson,
  reportHash,
  reportMemo,
  reportMemoInstruction,
  sha256Hex,
} from "./reportHash";

// A small report written out by hand, with its keys deliberately out of
// order. CANONICAL is the exact text that must be hashed, and EXPECTED_HASH
// was computed from that text outside this code:
//   printf '%s' "$CANONICAL" | shasum -a 256
const REPORT: ParcelReport = {
  parcelKey: "ohio:39049:010-000001",
  generatedAt: "2026-11-18T12:00:00.000Z",
  coverage: "partial",
  biggestOpenQuestion: "flood",
  checks: [
    {
      status: "evidenceFound",
      kind: "flood",
      finding: "Zone X (minimal flood hazard).",
      limitation: "FEMA maps can be out of date.",
      sources: [
        {
          url: "https://hazards.fema.gov/",
          title: "National Flood Hazard Layer",
          authority: "FEMA",
          retrievedAt: "2026-11-18T12:00:00.000Z",
          effectiveDate: undefined,
        },
      ],
      responsibleParty: { role: "Surveyor", organization: undefined },
      nextAction: "Ask a surveyor for an elevation certificate.",
    },
  ],
};

const CANONICAL =
  '{"checks":[{"finding":"Zone X (minimal flood hazard).","kind":"flood","limitation":"FEMA maps can be out of date.","nextAction":"Ask a surveyor for an elevation certificate.","responsibleParty":{"role":"Surveyor"},"sources":[{"authority":"FEMA","retrievedAt":"2026-11-18T12:00:00.000Z","title":"National Flood Hazard Layer","url":"https://hazards.fema.gov/"}],"status":"evidenceFound"}],"generatedAt":"2026-11-18T12:00:00.000Z","parcelKey":"ohio:39049:010-000001"}';
const EXPECTED_HASH =
  "2e9c751040c3514440fc7e48899dfb5d612ea163661d668e1ee47f5a77dc0cf3";

/** The same value with every object's keys in reverse order. */
function reverseKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseKeys) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    ) as T;
  }
  return value;
}

const clone = (report: ParcelReport): ParcelReport => structuredClone(report);

describe("sha256Hex", () => {
  it("matches the published SHA-256 test vectors", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes text as UTF-8", async () => {
    // printf 'é' | shasum -a 256
    expect(await sha256Hex("é")).toBe(
      "4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c",
    );
  });
});

describe("canonicalJson", () => {
  it("sorts keys at every depth, keeps array order, and adds no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: "x" } })).toBe(
      '{"a":{"c":"x","d":[3,1,2]},"b":1}',
    );
  });

  it("leaves out undefined members but keeps null", () => {
    expect(canonicalJson({ a: undefined, b: null, c: [undefined] })).toBe(
      '{"b":null,"c":[null]}',
    );
  });

  it("sorts keys by UTF-16 code unit, not locale", () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, é: 4 })).toBe(
      '{"B":2,"a":3,"b":1,"é":4}',
    );
  });

  it("escapes strings exactly as JSON.stringify does", () => {
    const text = 'quote " slash \\ newline \n tab \t line-sep   é';
    expect(canonicalJson(text)).toBe(JSON.stringify(text));
  });

  it("writes numbers in their shortest JSON form", () => {
    expect(canonicalJson([1, 1.5, -0, 1e21, 0.000001])).toBe(
      "[1,1.5,0,1e+21,0.000001]",
    );
  });

  it("refuses values JSON cannot carry exactly", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson({ a: Infinity })).toThrow();
    expect(() => canonicalJson(BigInt(1))).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
  });
});

describe("reportHash", () => {
  it("hashes exactly the canonical JSON of parcelKey, generatedAt, and checks", async () => {
    expect(reportCanonicalJson(REPORT)).toBe(CANONICAL);
    expect(await reportHash(REPORT)).toBe(EXPECTED_HASH);
  });

  it("does not depend on key order or on a JSON round trip", async () => {
    expect(await reportHash(reverseKeys(REPORT))).toBe(EXPECTED_HASH);
    const served = JSON.parse(JSON.stringify(REPORT)) as ParcelReport;
    expect(await reportHash(served)).toBe(EXPECTED_HASH);
  });

  it("ignores fields outside parcelKey, generatedAt, and checks", async () => {
    const other = {
      ...clone(REPORT),
      coverage: "deep",
      biggestOpenQuestion: "zoning",
    } as const;
    expect(await reportHash(other)).toBe(EXPECTED_HASH);
  });

  it("changes when any hashed field changes", async () => {
    const edits: ((report: ParcelReport) => void)[] = [
      (r) => (r.parcelKey = "ohio:39049:010-000002"),
      (r) => (r.generatedAt = "2026-11-18T12:00:00.001Z"),
      (r) => (r.checks[0]!.status = "needsReview"),
      (r) => (r.checks[0]!.finding += " "),
      (r) => (r.checks[0]!.limitation = ""),
      (r) =>
        (r.checks[0]!.sources[0]!.retrievedAt = "2026-11-19T12:00:00.000Z"),
      (r) => (r.checks[0]!.responsibleParty.organization = "County engineer"),
      (r) => (r.checks[0]!.transactionSignature = "sig"),
      (r) => r.checks.push(clone(REPORT).checks[0]!),
    ];
    const hashes = await Promise.all(
      edits.map((edit) => {
        const report = clone(REPORT);
        edit(report);
        return reportHash(report);
      }),
    );
    for (const hash of hashes) expect(hash).not.toBe(EXPECTED_HASH);
    expect(new Set(hashes).size).toBe(edits.length);
  });

  it("depends on the order of the checks", async () => {
    const report = clone(goldenReport);
    expect(report.checks.length).toBeGreaterThan(1);
    const reordered = { ...report, checks: [...report.checks].reverse() };
    expect(await reportHash(reordered)).not.toBe(await reportHash(report));
  });

  it("gives each staged fixture report its own stable fingerprint", async () => {
    const golden = await reportHash(goldenReport);
    expect(golden).toMatch(/^[0-9a-f]{64}$/);
    expect(await reportHash(clone(goldenReport))).toBe(golden);
    expect(await reportHash(secondCountyReport)).not.toBe(golden);
  });
});

describe("report memo", () => {
  it("names the fingerprint after the groundtruth:report: prefix", () => {
    expect(reportMemo(EXPECTED_HASH)).toBe(
      `groundtruth:report:${EXPECTED_HASH}`,
    );
    expect(parseReportMemo(reportMemo(EXPECTED_HASH))).toBe(EXPECTED_HASH);
  });

  it("refuses anything but a lowercase hex SHA-256", () => {
    expect(() => reportMemo(EXPECTED_HASH.toUpperCase())).toThrow();
    expect(() => reportMemo(EXPECTED_HASH.slice(1))).toThrow();
    expect(
      parseReportMemo(`${REPORT_MEMO_PREFIX}${EXPECTED_HASH.toUpperCase()}`),
    ).toBeNull();
    expect(
      parseReportMemo(`${REPORT_MEMO_PREFIX}${EXPECTED_HASH} `),
    ).toBeNull();
    expect(parseReportMemo(`groundtruth:doc:${EXPECTED_HASH}`)).toBeNull();
    expect(parseReportMemo("")).toBeNull();
  });

  it("builds a Memo v1 instruction signed by the sender", () => {
    const signer = "11111111111111111111111111111112";
    const ix = reportMemoInstruction({ signer, sha256: EXPECTED_HASH });
    expect(ix.programId).toBe(MEMO_PROGRAM_ID);
    expect(ix.programId).toBe("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");
    expect(ix.keys).toEqual([
      { pubkey: signer, isSigner: true, isWritable: false },
    ]);
    expect(new TextDecoder().decode(ix.data)).toBe(
      `groundtruth:report:${EXPECTED_HASH}`,
    );
    expect(ix.data.length).toBe(83);
  });
});
