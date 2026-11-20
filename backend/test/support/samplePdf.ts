/**
 * Sample deal documents for tests and demos: real, valid one-page PDFs with
 * plain (uncompressed) text, each clearly marked as a fake test file. The
 * committed copies in test/fixtures/documents come from
 * scripts/make-sample-documents.ts; the tests check they are current.
 */

export interface SampleDocument {
  file: string;
  /** Lines printed on the page, top to bottom. */
  lines: string[];
}

const FAKE = "STAGED DEMO TEST FILE - NOT A REAL DOCUMENT";

/** Three samples for parcel 230-000918 (Franklin County, ohio:39049:230-000918). */
export const SAMPLE_DOCUMENTS = {
  /** Names the deal's parcel, in Franklin's printed "-00" form. */
  matching: {
    file: "septic-evaluation-230-000918.pdf",
    lines: [
      FAKE,
      "Franklin County Public Health - Septic System Soil Evaluation",
      "Parcel ID: 230-000918-00",
      "Site address: 0 Example Road, Galloway, OH 43119",
      "Finding: Soils are very limited for a standard leach field;",
      "a mound system is required before a permit can issue.",
    ],
  },
  /** Names a different parcel: the warning case. */
  mismatched: {
    file: "survey-plat-230-004411.pdf",
    lines: [
      FAKE,
      "Boundary Survey Plat",
      "Parcel No. 230-004411",
      "Property: 12 Sample Lane, Galloway, OH 43119",
      "Finding: Survey shows a 14 ft encroachment of a shed",
      "onto the north line.",
    ],
  },
  /** Prints no parcel ID at all. */
  noParcelId: {
    file: "zoning-letter-no-parcel.pdf",
    lines: [
      FAKE,
      "Zoning Verification Letter",
      "The property is zoned Rural (R).",
      "Finding: Single-family residential use is permitted.",
    ],
  },
} as const satisfies Record<string, SampleDocument>;

/** A valid single-page PDF printing `lines` in Helvetica. */
export function samplePdf(lines: readonly string[]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines
    .map(
      (line, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${escape(line)}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** The text a sample PDF prints, read back from its content stream. */
export function pdfText(bytes: Buffer): string[] {
  const source = bytes.toString("latin1");
  return [...source.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) =>
    m[1]!.replace(/\\(.)/g, "$1"),
  );
}
