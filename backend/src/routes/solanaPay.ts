import { randomUUID } from "node:crypto";
import { web3 } from "@anchor-lang/core";
import {
  USDC_MINT_DEVNET,
  type SolanaPayError,
  type SolanaPayLabel,
  type SolanaPayTransactionResponse,
} from "@groundtruth/shared";
import type { PrismaClient } from "@prisma/client";
import express, {
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import {
  createFundChain,
  createFundTransactionBuilder,
  type FundBuild,
  type FundChain,
} from "../chain/fundTransaction.js";
import { formatUsdc } from "../chain/usdc.js";
import { HttpError, logSafeFailure } from "../http/errors.js";

export interface SolanaPayRouteOptions {
  /** Public devnet reads. Defaults to SOLANA_RPC_URL or api.devnet.solana.com. */
  chain?: FundChain;
  rpcUrl?: string;
  /** Absolute SVG/PNG/WebP URL the wallet shows next to the label. */
  iconUrl?: string;
}

export const DEFAULT_SOLANA_PAY_ICON =
  "https://groundtruth-lac.vercel.app/favicon.svg";

const LABEL = "GroundTruth escrow (devnet)";

const dealIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
// The spec asks both sides to allow extra fields.
const bodySchema = z.object({ account: z.string().min(32).max(44) });

/**
 * Solana Pay transaction request for funding a draft staged deal:
 *
 *   GET  /api/deals/:id/solana-pay/fund   { label, icon }
 *   POST /api/deals/:id/solana-pay/fund   { account } -> { transaction, message }
 *
 * The POST answers only the deal's bound buyer wallet, only while the deal
 * is a draft in the API and on devnet, with the buyer's `fund` transaction:
 * unsigned, fee payer the buyer, built from the checked-in IDL. The API never
 * signs. Refusals carry the spec's `message` (a wallet shows its first 80
 * characters) beside the usual `error` envelope. CORS is open because the
 * spec asks for it: a wallet may call from any origin, and nothing here is
 * private.
 */
export function solanaPayRoutes(
  prisma: PrismaClient,
  options: SolanaPayRouteOptions = {},
) {
  const build = createFundTransactionBuilder(
    options.chain ?? createFundChain(options.rpcUrl),
  );
  const iconUrl = options.iconUrl ?? DEFAULT_SOLANA_PAY_ICON;

  const cors: RequestHandler = (_req, res, next) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader(
      "access-control-allow-headers",
      "Content-Type, Accept, Accept-Encoding",
    );
    next();
  };

  const preflight: RequestHandler = (_req, res) => {
    res.status(204).end();
  };

  const label = [
    cors,
    route(async (req, res) => {
      await loadDeal(prisma, req);
      const body: SolanaPayLabel = { label: LABEL, icon: iconUrl };
      res.json(body);
    }),
  ];

  const transaction = [
    cors,
    express.raw({ type: () => true, limit: "4kb" }),
    route(async (req, res) => {
      res.setHeader("cache-control", "no-store");
      const account = readAccount(req.body);
      const deal = await loadDeal(prisma, req);

      if (deal.cluster !== "devnet" || deal.mint !== USDC_MINT_DEVNET) {
        throw new HttpError(
          409,
          "CONFLICT",
          "This deal is not a devnet test USDC deal.",
          false,
        );
      }
      if (account !== deal.buyerWallet) {
        throw new HttpError(
          403,
          "FORBIDDEN",
          `Only the deal's buyer wallet can fund it (${short(deal.buyerWallet)}).`,
          false,
        );
      }
      if (deal.state !== "draft") {
        throw new HttpError(
          409,
          "CONFLICT",
          `This deal is already ${deal.state}; it can be funded only once.`,
          false,
        );
      }
      if (!deal.escrowAddress) {
        throw notInitialized();
      }

      let built: FundBuild;
      try {
        built = await build({
          buyerWallet: deal.buyerWallet,
          sellerTokenAccount: deal.sellerTokenAccount,
          amountBaseUnits: deal.amountBaseUnits,
          mint: deal.mint,
          escrowAddress: deal.escrowAddress,
        });
      } catch {
        throw new HttpError(
          502,
          "PROVIDER_TIMEOUT",
          "Solana devnet did not answer. Try again in a moment.",
          true,
        );
      }
      if (!built.ok) throw refusal(built);

      const body: SolanaPayTransactionResponse = {
        transaction: built.transaction,
        message: `Fund deal ${deal.id}: ${formatUsdc(deal.amountBaseUnits)} test USDC into escrow on devnet.`,
      };
      res.json(body);
    }),
  ];

  return { cors, preflight, label, transaction };
}

function readAccount(raw: unknown): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : "");
  } catch {
    parsed = undefined;
  }
  const body = bodySchema.safeParse(parsed);
  if (body.success) {
    try {
      const key = new web3.PublicKey(body.data.account);
      if (key.toBase58() === body.data.account) return body.data.account;
    } catch {
      // Not base58 or not 32 bytes: same answer as a missing account.
    }
  }
  throw new HttpError(
    400,
    "INVALID_REQUEST",
    'Send {"account": "<base58 wallet address>"}.',
    false,
  );
}

async function loadDeal(prisma: PrismaClient, req: Request) {
  const id = dealIdSchema.safeParse(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );
  if (!id.success) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Deal ID must be 1-64 letters, digits, hyphens, or underscores.",
      false,
    );
  }
  const deal = await prisma.dealRecord.findUnique({ where: { id: id.data } });
  // Non-demo deals answer exactly like missing ones.
  if (!deal || !deal.publicDemo) {
    throw new HttpError(404, "NOT_FOUND", "No public deal has this ID.", false);
  }
  return deal;
}

function notInitialized() {
  return new HttpError(
    409,
    "CONFLICT",
    "This deal's escrow is not set up on devnet yet.",
    true,
  );
}

function refusal(built: Exclude<FundBuild, { ok: true }>): HttpError {
  switch (built.kind) {
    case "notDevnet":
      return new HttpError(
        503,
        "INTERNAL_ERROR",
        "This server is not connected to Solana devnet.",
        false,
      );
    case "notInitialized":
      return notInitialized();
    case "notDraft":
      // Confirmed chain state wins over the API's projection.
      return new HttpError(
        409,
        "CONFLICT",
        `Devnet shows this deal is already ${built.chainState.toLowerCase()}.`,
        false,
      );
    case "mismatch":
      return new HttpError(
        409,
        "CONFLICT",
        "The escrow on devnet does not match this deal. Nothing was built.",
        false,
      );
  }
}

const short = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

/** Like asyncRoute, but every refusal carries the spec's `message`. */
function route(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response) => {
    handler(req, res).catch((error: unknown) => {
      const requestId =
        typeof res.locals.requestId === "string"
          ? res.locals.requestId
          : randomUUID();
      const known =
        error instanceof HttpError
          ? error
          : new HttpError(
              500,
              "INTERNAL_ERROR",
              "The request could not be completed.",
              true,
            );
      if (!(error instanceof HttpError)) logSafeFailure(requestId, error);
      const body: SolanaPayError = {
        message: known.message,
        error: {
          code: known.code,
          message: known.message,
          requestId,
          retryable: known.retryable,
        },
      };
      res.status(known.status).json(body);
    });
  };
}
