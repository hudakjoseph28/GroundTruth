import type {
  DealDocumentContentType,
  DocumentFindings,
  DocumentParcelCheck,
} from "@groundtruth/shared";
import type { PrismaClient } from "@prisma/client";
import { parseParcelKey } from "../parcels/parcelKey.js";

/**
 * Document parcel checks: after an upload, the API reads the document and
 * compares the parcel ID printed in it with the deal's parcel. Advisory
 * only. Nothing here reads or writes deal state, a hold, or an approval;
 * the only row it writes is the document's own check.
 */

/** What a reader found in one document, as printed. */
export interface DocumentFacts {
  parcelId: string | null;
  address: string | null;
  documentType: string;
  keyFinding: string;
}

/** Reads one document's bytes; throws when it cannot read them. */
export interface DocumentReader {
  /** Named in the check row so a participant sees what read the file. */
  model: string;
  read(input: {
    bytes: Buffer;
    contentType: DealDocumentContentType;
  }): Promise<DocumentFacts>;
}

/** A failure a check records: a reason code, never document text. */
export class DocumentReadError extends Error {
  constructor(readonly code: string) {
    super(`Document read failed: ${code}`);
    this.name = "DocumentReadError";
  }
}

export type ParcelMatch = "matches" | "different" | "noParcelId";

/** Uppercase letters and digits only: "230-000918" and "230 000918" agree. */
export function normalizeParcelId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Whether `found` names the deal's parcel. IDs are compared on letters and
 * digits alone, so separators and case never matter. A found ID that is the
 * deal's ID followed only by zeros also matches: Franklin County prints
 * 230-000918 as "230-000918-00". Anything else is `different`.
 */
export function compareParcelId(
  dealParcelId: string,
  found: string | null,
): ParcelMatch {
  const theirs = found ? normalizeParcelId(found) : "";
  if (!theirs) return "noParcelId";
  const ours = normalizeParcelId(dealParcelId);
  if (theirs === ours) return "matches";
  if (
    ours.length > 0 &&
    theirs.startsWith(ours) &&
    /^0+$/.test(theirs.slice(ours.length))
  ) {
    return "matches";
  }
  return "different";
}

/** The parcel ID part of a deal's parcel key, or the key itself if it does not parse. */
export function dealParcelId(parcelKey: string): string {
  return parseParcelKey(parcelKey)?.sourceParcelId ?? parcelKey;
}

/** A check that has not settled after this long is reported unavailable. */
export const CHECK_STALE_MS = 5 * 60 * 1000;

/** The stored check columns. */
export interface StoredDocumentCheck {
  status: string;
  parcelMatch: string | null;
  parcelId: string | null;
  address: string | null;
  documentType: string | null;
  keyFinding: string | null;
  model: string | null;
  checkedAt: Date | null;
}

/** Public columns of a check: never the text read. */
export const PUBLIC_CHECK_COLUMNS = {
  status: true,
  parcelMatch: true,
  checkedAt: true,
} as const;

/**
 * The public status of a document's check. No row (a document uploaded
 * before checks existed), a failed or switched-off check, or a check stuck
 * pending (the API restarted mid-read) is `unavailable`: never a finding.
 */
export function toParcelCheck(
  check:
    | Pick<StoredDocumentCheck, "status" | "parcelMatch" | "checkedAt">
    | null
    | undefined,
  uploadedAt: Date,
  now: Date,
): DocumentParcelCheck {
  if (!check) return { status: "unavailable" };
  if (check.status === "pending") {
    return now.getTime() - uploadedAt.getTime() > CHECK_STALE_MS
      ? { status: "unavailable" }
      : { status: "checking" };
  }
  if (
    check.status === "done" &&
    (check.parcelMatch === "matches" ||
      check.parcelMatch === "different" ||
      check.parcelMatch === "noParcelId")
  ) {
    return {
      status: check.parcelMatch,
      ...(check.checkedAt ? { checkedAt: check.checkedAt.toISOString() } : {}),
    };
  }
  return { status: "unavailable" };
}

/** What a signed participant sees for one document. */
export function toDocumentFindings(
  row: {
    id: string;
    uploadedAt: Date;
    check: StoredDocumentCheck | null;
  },
  parcelKey: string,
  now: Date,
): DocumentFindings {
  const parcelCheck = toParcelCheck(row.check, row.uploadedAt, now);
  const check = row.check;
  const read =
    check?.status === "done" &&
    parcelCheck.status !== "unavailable" &&
    check.documentType !== null &&
    check.keyFinding !== null;
  return {
    documentId: row.id,
    parcelCheck,
    dealParcelId: dealParcelId(parcelKey),
    ...(read
      ? {
          found: {
            parcelId: check.parcelId,
            address: check.address,
            documentType: check.documentType!,
            keyFinding: check.keyFinding!,
          },
        }
      : {}),
    ...(check?.model ? { model: check.model } : {}),
  };
}

const LIMITS = {
  parcelId: 60,
  address: 200,
  documentType: 80,
  keyFinding: 240,
} as const;

/** Trims, collapses whitespace, and caps the length of one read field. */
function clean(value: string | null, max: number): string | null {
  if (value === null) return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Reader output made safe to store: trimmed, bounded, blanks as null. */
export function cleanFacts(facts: DocumentFacts): DocumentFacts {
  return {
    parcelId: clean(facts.parcelId, LIMITS.parcelId),
    address: clean(facts.address, LIMITS.address),
    documentType:
      clean(facts.documentType, LIMITS.documentType) ?? "Unknown document",
    keyFinding:
      clean(facts.keyFinding, LIMITS.keyFinding) ??
      "No finding could be read from this document.",
  };
}

/**
 * Reads one stored document and records its check. Never throws: a reader
 * failure is stored as `failed` with a reason code, and the public status
 * becomes `unavailable`. Writes only the document's check row.
 */
export async function runDocumentCheck(
  prisma: PrismaClient,
  reader: DocumentReader,
  input: {
    documentId: string;
    parcelKey: string;
    bytes: Buffer;
    contentType: DealDocumentContentType;
    now: () => Date;
    log?: (line: string) => void;
  },
): Promise<void> {
  const log = input.log ?? ((line) => console.warn(line));
  try {
    const facts = cleanFacts(
      await reader.read({ bytes: input.bytes, contentType: input.contentType }),
    );
    const parcelMatch = compareParcelId(
      dealParcelId(input.parcelKey),
      facts.parcelId,
    );
    await prisma.dealDocumentCheckRecord.update({
      where: { documentId: input.documentId },
      data: {
        status: "done",
        parcelMatch,
        parcelId: facts.parcelId,
        address: facts.address,
        documentType: facts.documentType,
        keyFinding: facts.keyFinding,
        model: reader.model,
        failure: null,
        checkedAt: input.now(),
      },
    });
  } catch (error) {
    const code =
      error instanceof DocumentReadError ? error.code : "READ_FAILED";
    // The document's text is never logged; only the reason code.
    log(`document check ${input.documentId} failed: ${code}`);
    try {
      await prisma.dealDocumentCheckRecord.update({
        where: { documentId: input.documentId },
        data: {
          status: "failed",
          failure: code,
          model: reader.model,
          checkedAt: input.now(),
        },
      });
    } catch {
      log(`document check ${input.documentId} could not record its failure`);
    }
  }
}
