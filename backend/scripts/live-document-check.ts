// Reads the three sample deal documents with the real Claude reader and
// prints what it found and whether each matches parcel 230-000918.
// Needs ANTHROPIC_API_KEY (backend/.env). Costs a few cents; never runs in CI.
//
//   pnpm --filter @groundtruth/backend check:documents
import { readFileSync } from "node:fs";
import { createClaudeDocumentReader } from "../src/documents/claudeReader.js";
import { cleanFacts, compareParcelId } from "../src/documents/parcelCheck.js";
import { SAMPLE_DOCUMENTS } from "../test/support/samplePdf.js";

const DEAL_PARCEL_ID = "230-000918";
const expected = {
  matching: "matches",
  mismatched: "different",
  noParcelId: "noParcelId",
} as const;

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "ANTHROPIC_API_KEY is not set (backend/.env). Nothing was sent.",
  );
  process.exit(1);
}
const reader = createClaudeDocumentReader({ apiKey });

let failures = 0;
for (const [name, sample] of Object.entries(SAMPLE_DOCUMENTS)) {
  const bytes = readFileSync(
    new URL(`../test/fixtures/documents/${sample.file}`, import.meta.url),
  );
  const started = Date.now();
  try {
    const facts = cleanFacts(
      await reader.read({ bytes, contentType: "application/pdf" }),
    );
    const match = compareParcelId(DEAL_PARCEL_ID, facts.parcelId);
    const want = expected[name as keyof typeof expected];
    if (match !== want) failures += 1;
    console.log(
      JSON.stringify(
        { sample: sample.file, ms: Date.now() - started, match, want, facts },
        null,
        2,
      ),
    );
  } catch (error) {
    failures += 1;
    console.log(`${sample.file}: ${(error as Error).message}`);
  }
}
console.log(
  failures === 0 ? "All three samples as expected." : `${failures} unexpected.`,
);
process.exit(failures === 0 ? 0 : 1);
