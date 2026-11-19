import {
  DEAL_DOCUMENT_MAX_BYTES,
  type DealDocument,
  type DealDocumentContentType,
  type TimelineEvent,
} from "@groundtruth/shared";

/** Lowercase hex SHA-256 of a file, computed in the browser. */
export async function sha256Hex(data: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const buffer =
    data instanceof Blob
      ? await data.arrayBuffer()
      : data instanceof Uint8Array
        ? data.slice().buffer
        : data;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** What the bytes are, the same rule the API applies (backend documents/fileType.ts). */
export function detectContentType(bytes: Uint8Array): DealDocumentContentType | null {
  const starts = (magic: number[]) =>
    bytes.length >= magic.length && magic.every((value, i) => bytes[i] === value);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

const EXTENSIONS: Record<string, DealDocumentContentType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export type UploadCheck =
  | { ok: true; contentType: DealDocumentContentType }
  | { ok: false; reason: "tooBig" | "wrongType" | "noFile" };

/** The checks the API makes, run first so a bad file never asks for a signature. */
export function checkUpload(name: string, bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) return { ok: false, reason: "noFile" };
  if (bytes.length > DEAL_DOCUMENT_MAX_BYTES) return { ok: false, reason: "tooBig" };
  const dot = name.lastIndexOf(".");
  const claimed = dot >= 0 ? EXTENSIONS[name.slice(dot + 1).toLowerCase()] : undefined;
  const detected = detectContentType(bytes);
  if (!claimed || !detected || claimed !== detected) return { ok: false, reason: "wrongType" };
  return { ok: true, contentType: detected };
}

export interface HashCheck {
  sha256: string;
  /** The deal document with exactly this hash. */
  document?: DealDocument;
  /** Approval rows whose on-chain memo names this hash. */
  citedBy: TimelineEvent[];
}

/** Compares a file's hash with the deal's documents and the hashes its approvals committed to. */
export function matchHash(
  sha256: string,
  documents: readonly DealDocument[],
  timeline: readonly TimelineEvent[],
): HashCheck {
  return {
    sha256,
    document: documents.find((doc) => doc.sha256 === sha256),
    citedBy: timeline.filter((event) => event.citedDocument?.sha256 === sha256),
  };
}

export const shortHash = (sha256: string) => `${sha256.slice(0, 8)}…${sha256.slice(-8)}`;
