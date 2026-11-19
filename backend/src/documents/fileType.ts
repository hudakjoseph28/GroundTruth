import type { DealDocumentContentType } from "@groundtruth/shared";

/**
 * What a file really is, from its first bytes. The extension alone is
 * never trusted: an upload is accepted only when the bytes and the
 * extension name the same type.
 */
export function detectContentType(
  bytes: Uint8Array,
): DealDocumentContentType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf"; // "%PDF-"
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

const EXTENSIONS: Record<string, DealDocumentContentType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** The type a filename's extension claims, or null for anything else. */
export function contentTypeForFilename(
  filename: string,
): DealDocumentContentType | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSIONS[filename.slice(dot + 1).toLowerCase()] ?? null;
}

const MAX_FILENAME = 120;

/**
 * The display filename: the last path segment, without control characters,
 * at most 120 characters, keeping the extension. Null when nothing is left.
 */
export function cleanFilename(raw: string): string | null {
  const base = (raw.split(/[/\\]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!base || base === "." || base === "..") return null;
  if (base.length <= MAX_FILENAME) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 6 ? base.slice(dot) : "";
  return base.slice(0, MAX_FILENAME - ext.length) + ext;
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return (
    bytes.length >= magic.length &&
    magic.every((value, i) => bytes[i] === value)
  );
}
