/**
 * A DocumentReader for tests that really reads the sample PDFs (their
 * uncompressed text), standing in for Claude so tests make no network call.
 */
import {
  DocumentReadError,
  type DocumentFacts,
  type DocumentReader,
} from "../../src/documents/parcelCheck.js";
import { pdfText } from "./samplePdf.js";

export function fixtureReader(): DocumentReader & { calls: number } {
  const reader = {
    model: "test-fixture-reader",
    calls: 0,
    async read({ bytes }: { bytes: Buffer }): Promise<DocumentFacts> {
      reader.calls += 1;
      const lines = pdfText(bytes);
      if (lines.length === 0) throw new DocumentReadError("NO_TEXT");
      const field = (pattern: RegExp) =>
        lines.map((line) => pattern.exec(line)?.[1]).find(Boolean) ?? null;
      const findingAt = lines.findIndex((line) => line.startsWith("Finding:"));
      return {
        parcelId: field(/^Parcel (?:ID|No\.):?\s*(.+)$/),
        address: field(/^(?:Site address|Property):\s*(.+)$/),
        documentType: lines[1] ?? "",
        keyFinding:
          findingAt < 0
            ? ""
            : lines
                .slice(findingAt)
                .join(" ")
                .replace(/^Finding:\s*/, ""),
      };
    },
  };
  return reader;
}
