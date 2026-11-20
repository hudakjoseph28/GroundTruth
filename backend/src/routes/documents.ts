import { createHash, randomUUID } from "node:crypto";
import {
  DEAL_DOCUMENT_MAX_BYTES,
  DEAL_DOCUMENT_TYPES,
  DOCUMENT_UPLOAD_HEADERS,
  type DealDocumentType,
} from "@groundtruth/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import express, {
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
} from "express";
import { z } from "zod";
import { toDealDocument } from "../deals/mapDeal.js";
import {
  cleanFilename,
  contentTypeForFilename,
  detectContentType,
} from "../documents/fileType.js";
import {
  PUBLIC_CHECK_COLUMNS,
  runDocumentCheck,
  toDocumentFindings,
  toParcelCheck,
  type DocumentReader,
} from "../documents/parcelCheck.js";
import {
  verifyParticipantRequest,
  type DealParticipants,
  type VerifiedParticipant,
} from "../documents/walletAuth.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";

const dealIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const documentIdSchema = z.string().uuid();

/** Public columns of a document row; never the bytes. */
const METADATA = {
  id: true,
  dealId: true,
  type: true,
  filename: true,
  contentType: true,
  sizeBytes: true,
  sha256: true,
  uploaderRole: true,
  uploadedAt: true,
  check: { select: PUBLIC_CHECK_COLUMNS },
} as const;

export interface DocumentRouteOptions {
  now?: () => Date;
  /**
   * Reads an uploaded document and checks its parcel ID against the deal's
   * (documents/parcelCheck.ts). Absent: uploads are stored unread and their
   * parcel check is `unavailable`.
   */
  reader?: DocumentReader;
  /** Runs a check after the upload response. Default: in the background. */
  schedule?: (task: () => Promise<void>) => void;
  log?: (line: string) => void;
}

/** A deal's public document rows with their parcel check status. */
type DocumentRow = Parameters<typeof toDealDocument>[0] & {
  check: Parameters<typeof toParcelCheck>[0];
};

/**
 * Deal documents (staged demo):
 *
 *   GET  /api/deals/:id/documents                    public metadata only
 *   POST /api/deals/:id/documents                    participant upload (raw body)
 *   POST /api/deals/:id/documents/:documentId/file   participant download
 *   POST /api/deals/:id/documents/findings           participant: what each document says
 *
 * Writes, downloads, and findings need a fresh wallet signature from the
 * deal's buyer, seller, or an assigned reviewer (documents/walletAuth.ts).
 * The API signs nothing.
 *
 * After an upload the API reads the document (options.reader) and compares
 * the parcel ID it prints with the deal's. The public list carries only the
 * match status; the text read goes to a signed participant. Advisory: a
 * check never blocks an upload or an approval and never changes deal state.
 */
export function documentRoutes(
  prisma: PrismaClient,
  options: DocumentRouteOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((line: string) => console.warn(line));
  const schedule =
    options.schedule ??
    ((task: () => Promise<void>) => {
      setImmediate(() => void task());
    });
  const publicDocument = (row: DocumentRow) =>
    toDealDocument(row, toParcelCheck(row.check, row.uploadedAt, now()));

  const list: RequestHandler = asyncRoute(async (req, res) => {
    const deal = await loadDeal(prisma, req);
    const rows = await prisma.dealDocumentRecord.findMany({
      where: { dealId: deal.id },
      orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
      select: METADATA,
    });
    res.json(rows.map(publicDocument));
  });

  const upload: (RequestHandler | ErrorRequestHandler)[] = [
    express.raw({ type: () => true, limit: DEAL_DOCUMENT_MAX_BYTES }),
    tooLarge,
    asyncRoute(async (req, res) => {
      const deal = await loadDeal(prisma, req);
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (bytes.length === 0) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Choose a file to upload.",
          false,
        );
      }
      if (bytes.length > DEAL_DOCUMENT_MAX_BYTES) throw tooLargeError();

      const type = readType(req);
      const filename = readFilename(req);
      const claimed = contentTypeForFilename(filename);
      const detected = detectContentType(bytes);
      if (!claimed || !detected || claimed !== detected) {
        throw new HttpError(
          415,
          "INVALID_REQUEST",
          "Upload a PDF, PNG, or JPG file. The file's contents must match its extension.",
          false,
        );
      }

      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const participant = verifyParticipantRequest(
        req,
        deal,
        { action: "upload", sha256 },
        now(),
      );
      await burnNonce(prisma, participant);

      const existing = await prisma.dealDocumentRecord.findUnique({
        where: { dealId_sha256: { dealId: deal.id, sha256 } },
        select: { filename: true },
      });
      if (existing) {
        throw new HttpError(
          409,
          "CONFLICT",
          `This exact file is already on the deal as “${existing.filename}”.`,
          false,
        );
      }

      const id = randomUUID();
      try {
        const row = await prisma.dealDocumentRecord.create({
          data: {
            id,
            dealId: deal.id,
            type,
            filename,
            contentType: detected,
            sizeBytes: bytes.length,
            sha256,
            uploaderRole: participant.role,
            uploaderWallet: participant.wallet,
            uploadedAt: now(),
            file: { create: { content: new Uint8Array(bytes) } },
            check: {
              create: { status: options.reader ? "pending" : "off" },
            },
          },
          select: METADATA,
        });
        res.status(201).json(publicDocument(row));
        const reader = options.reader;
        if (reader) {
          schedule(() =>
            runDocumentCheck(prisma, reader, {
              documentId: id,
              parcelKey: deal.parcelKey,
              bytes,
              contentType: detected,
              now,
              log,
            }),
          );
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(
            409,
            "CONFLICT",
            "This exact file is already on the deal.",
            false,
          );
        }
        throw error;
      }
    }),
  ];

  const file: RequestHandler[] = [
    // A download carries its proof in headers; any body is ignored.
    express.raw({ type: () => true, limit: "1kb" }),
    asyncRoute(async (req, res) => {
      const deal = await loadDeal(prisma, req);
      const documentId = documentIdSchema.safeParse(
        readParam(req.params.documentId),
      );
      if (!documentId.success) throw noDocument();

      const participant = verifyParticipantRequest(
        req,
        deal,
        { action: "view", documentId: documentId.data },
        now(),
      );
      await burnNonce(prisma, participant);

      const row = await prisma.dealDocumentRecord.findFirst({
        where: { id: documentId.data, dealId: deal.id },
        select: { filename: true, contentType: true, file: true },
      });
      if (!row?.file) throw noDocument();

      res.setHeader("content-type", row.contentType);
      res.setHeader(
        "content-disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      );
      res.setHeader("cache-control", "private, no-store");
      res.setHeader("x-content-type-options", "nosniff");
      res.status(200).end(Buffer.from(row.file.content));
    }),
  ];

  const findings: RequestHandler[] = [
    express.raw({ type: () => true, limit: "1kb" }),
    asyncRoute(async (req, res) => {
      const deal = await loadDeal(prisma, req);
      const participant = verifyParticipantRequest(
        req,
        deal,
        { action: "findings" },
        now(),
      );
      await burnNonce(prisma, participant);

      const rows = await prisma.dealDocumentRecord.findMany({
        where: { dealId: deal.id },
        orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          uploadedAt: true,
          check: {
            select: {
              status: true,
              parcelMatch: true,
              parcelId: true,
              address: true,
              documentType: true,
              keyFinding: true,
              model: true,
              checkedAt: true,
            },
          },
        },
      });
      const at = now();
      res.setHeader("cache-control", "private, no-store");
      res.json(rows.map((row) => toDocumentFindings(row, deal.parcelKey, at)));
    }),
  ];

  return { list, upload, file, findings };
}

/** A public staged deal and the wallets bound to it. */
async function loadDeal(
  prisma: PrismaClient,
  req: Request,
): Promise<DealParticipants & { parcelKey: string }> {
  const parsed = dealIdSchema.safeParse(readParam(req.params.id));
  if (!parsed.success) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Deal ID must be 1-64 letters, digits, hyphens, or underscores.",
      false,
    );
  }
  const deal = await prisma.dealRecord.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      parcelKey: true,
      publicDemo: true,
      buyerWallet: true,
      sellerWallet: true,
      reviewers: { select: { wallet: true, role: true, position: true } },
    },
  });
  // Same answer as a missing deal, as GET /api/deals/:id gives.
  if (!deal || !deal.publicDemo) {
    throw new HttpError(404, "NOT_FOUND", "No public deal has this ID.", false);
  }
  return deal;
}

/** Records the nonce; a second use of the same signed request is refused. */
async function burnNonce(
  prisma: PrismaClient,
  participant: VerifiedParticipant,
): Promise<void> {
  try {
    await prisma.documentAuthNonceRecord.create({
      data: {
        wallet: participant.wallet,
        nonce: participant.nonce,
        usedAt: new Date(),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(
        401,
        "FORBIDDEN",
        "This signed request was already used. Sign again to continue.",
        false,
      );
    }
    throw error;
  }
}

function readType(req: Request): DealDocumentType {
  const raw = req.get(DOCUMENT_UPLOAD_HEADERS.type) ?? "";
  const found = DEAL_DOCUMENT_TYPES.find((type) => type === raw);
  if (!found) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Choose what kind of document this is.",
      false,
    );
  }
  return found;
}

function readFilename(req: Request): string {
  let decoded = "";
  try {
    decoded = decodeURIComponent(
      req.get(DOCUMENT_UPLOAD_HEADERS.filename) ?? "",
    );
  } catch {
    decoded = "";
  }
  const filename = cleanFilename(decoded);
  if (!filename) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "The file needs a name.",
      false,
    );
  }
  return filename;
}

const tooLargeError = () =>
  new HttpError(
    413,
    "INVALID_REQUEST",
    "That file is larger than 10 MB. Upload a smaller copy.",
    false,
  );

/** body-parser's own 413 becomes the contract's error envelope. */
const tooLarge: ErrorRequestHandler = (error, _req, _res, next) => {
  const type = (error as { type?: unknown } | null)?.type;
  next(type === "entity.too.large" ? tooLargeError() : error);
};

const noDocument = () =>
  new HttpError(
    404,
    "NOT_FOUND",
    "This deal has no document with that ID.",
    false,
  );

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
