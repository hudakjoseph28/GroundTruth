// Writes the sample deal documents (fake, clearly labeled test PDFs) to
// test/fixtures/documents. Run: pnpm --filter @groundtruth/backend make:sample-documents
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAMPLE_DOCUMENTS, samplePdf } from "../test/support/samplePdf.js";

const dir = fileURLToPath(
  new URL("../test/fixtures/documents/", import.meta.url),
);
for (const sample of Object.values(SAMPLE_DOCUMENTS)) {
  writeFileSync(`${dir}${sample.file}`, samplePdf(sample.lines));
  console.log(`wrote test/fixtures/documents/${sample.file}`);
}
