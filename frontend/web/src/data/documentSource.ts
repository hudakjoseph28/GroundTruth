import {
  DOCUMENT_UPLOAD_HEADERS,
  type ApiError,
  type DealDocument,
  type DealDocumentType,
  type DocumentFindings,
} from "@groundtruth/shared";
import { request, type FailedOutcome } from "./api";

/**
 * Deal documents from the GroundTruth API:
 *
 *   GET  /api/deals/:id/documents                    public metadata
 *   POST /api/deals/:id/documents                    signed upload, raw body
 *   POST /api/deals/:id/documents/:documentId/file   signed download
 *   POST /api/deals/:id/documents/findings           signed: what each document says
 *
 * Signed requests carry the wallet's signature in headers (signedRequest.ts).
 */

export type DocumentsOutcome =
  | { status: "found"; documents: DealDocument[] }
  | { status: "missing"; message: string }
  | FailedOutcome;

export async function listDocuments(
  dealId: string,
  signal?: AbortSignal,
): Promise<DocumentsOutcome> {
  const response = await request(`/api/deals/${encodeURIComponent(dealId)}/documents`, signal);
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "missing", message: response.error.error.message };
  }
  return { status: "found", documents: response.body as DealDocument[] };
}

export type SignedOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "rejected"; message: string };

const UNREACHABLE = "GroundTruth could not be reached. Check your connection and try again.";

export async function uploadDocument(input: {
  dealId: string;
  file: File;
  bytes: Uint8Array;
  type: DealDocumentType;
  auth: Record<string, string>;
}): Promise<SignedOutcome<DealDocument>> {
  const response = await send(`/api/deals/${encodeURIComponent(input.dealId)}/documents`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/octet-stream",
      [DOCUMENT_UPLOAD_HEADERS.type]: input.type,
      [DOCUMENT_UPLOAD_HEADERS.filename]: encodeURIComponent(input.file.name),
      ...input.auth,
    },
    body: input.bytes.slice().buffer,
  });
  if (response.status !== "ok") return response;
  return { status: "ok", value: (await response.response.json()) as DealDocument };
}

export async function fetchDocumentFile(input: {
  dealId: string;
  documentId: string;
  auth: Record<string, string>;
}): Promise<SignedOutcome<Blob>> {
  const response = await send(
    `/api/deals/${encodeURIComponent(input.dealId)}/documents/${encodeURIComponent(input.documentId)}/file`,
    { method: "POST", headers: input.auth },
  );
  if (response.status !== "ok") return response;
  return { status: "ok", value: await response.response.blob() };
}

export async function fetchDocumentFindings(input: {
  dealId: string;
  auth: Record<string, string>;
}): Promise<SignedOutcome<DocumentFindings[]>> {
  const response = await send(
    `/api/deals/${encodeURIComponent(input.dealId)}/documents/findings`,
    { method: "POST", headers: { accept: "application/json", ...input.auth } },
  );
  if (response.status !== "ok") return response;
  return { status: "ok", value: (await response.response.json()) as DocumentFindings[] };
}

async function send(
  path: string,
  init: RequestInit,
): Promise<{ status: "ok"; response: Response } | { status: "rejected"; message: string }> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return { status: "rejected", message: UNREACHABLE };
  }
  if (response.ok) return { status: "ok", response };
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return { status: "rejected", message: body?.error?.message ?? UNREACHABLE };
}
