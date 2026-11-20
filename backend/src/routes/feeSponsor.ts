// Fee sponsorship for the reviewer portal (/review).
//
//   GET  /api/fee-sponsor                         whether fees are covered now,
//                                                 or the safe reason they aren't
//   POST /api/deals/:id/sponsored-transaction     a fee-payer-signed transaction
//
// The POST answers only for a staged deal, only for `sign_approval`,
// `place_hold`, or `release`, and only for a wallet the deal binds as a
// reviewer. The API signs as GroundTruth's fee payer and nothing else; the
// reviewer's wallet signs as the reviewer and sends it.
import { Buffer } from "node:buffer";
import { web3 } from "@anchor-lang/core";
import {
  HOLD_REASON_CODES,
  SPONSORED_ACTIONS,
  isSha256Hex,
  stagedDemoChainAccounts,
  stagedDemoDeals,
  type FeeSponsorStatus,
  type SponsoredTransactionRequest,
} from "@groundtruth/shared";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import { ActionRefusal, ChainUnavailable } from "../actions/approvalAction.js";
import type { SponsorChain } from "../actions/devnetChain.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError, logSafeFailure } from "../http/errors.js";
import {
  MIN_FEE_PAYER_LAMPORTS,
  type FeeSponsorConfig,
  type FeeSponsorSetupReason,
} from "../sponsor/feePayer.js";
import type { SponsorLedger } from "../sponsor/ledger.js";
import { createRateLimiter, type RateLimiter } from "../sponsor/rateLimit.js";
import {
  SponsorGuardRefused,
  SponsorUnavailable,
  SponsoredSimulationFailed,
  buildSponsoredTransaction,
  type SponsorableDeal,
} from "../sponsor/sponsoredTransaction.js";

export interface FeeSponsorRouteOptions {
  /** Unset: sponsorship is off and every POST answers 503. */
  config?: FeeSponsorConfig;
  /** Why `config` is unset, from readFeeSponsor (default `missing_key`). */
  offReason?: FeeSponsorSetupReason;
  /** How long one fee-payer balance read is reused (default 30 s). */
  balanceTtlMs?: number;
  now?: () => number;
  chain: SponsorChain;
  ledger: SponsorLedger;
  limiter?: RateLimiter;
}

const publicKey = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  .refine(isPublicKey);
const role = z.enum(["title", "survey", "septic"]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sign_approval"),
    account: publicKey,
    role,
    documentSha256: z.string().refine(isSha256Hex).optional(),
  }),
  z.object({
    action: z.literal("place_hold"),
    account: publicKey,
    role,
    reasonCode: z.enum(HOLD_REASON_CODES as [string, ...string[]]),
  }),
  z.object({ action: z.literal("release"), account: publicKey }),
]);

/** Staged deals with a known on-chain deal ID; nothing else is sponsored. */
const SPONSORABLE = new Map<string, SponsorableDeal>(
  stagedDemoDeals.flatMap((deal) => {
    const chain = (
      stagedDemoChainAccounts as Record<string, { dealIdHex: string }>
    )[deal.id];
    return chain
      ? [
          [
            deal.id,
            {
              id: deal.id,
              escrowAddress: deal.escrowAddress,
              dealIdHex: chain.dealIdHex,
            },
          ] as const,
        ]
      : [];
  }),
);

export function feeSponsorRoutes(options: FeeSponsorRouteOptions) {
  const limiter = options.limiter ?? createRateLimiter();
  const { config } = options;

  const lowBalance = config
    ? feePayerLowBalance(
        options.chain,
        config.keypair.publicKey.toBase58(),
        options.balanceTtlMs ?? BALANCE_TTL_MS,
        options.now ?? Date.now,
      )
    : undefined;

  const status: RequestHandler = asyncRoute(async (_req, res) => {
    let body: FeeSponsorStatus;
    if (!config) {
      body = { enabled: false, reason: options.offReason ?? "missing_key" };
    } else if (await lowBalance!()) {
      body = { enabled: false, reason: "low_balance" };
    } else {
      body = {
        enabled: true,
        feePayer: config.keypair.publicKey.toBase58(),
        maxPerDeal: config.maxPerDeal,
      };
    }
    res.set("cache-control", "no-store").json(body);
  });

  const transaction: RequestHandler[] = [
    rawJson,
    asyncRoute(async (req, res) => {
      if (!config) {
        throw sponsorError(
          new SponsorUnavailable(
            503,
            "off",
            "GroundTruth isn't covering network fees on this server.",
          ),
        );
      }
      const deal = SPONSORABLE.get(String(req.params.id ?? ""));
      if (!deal) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "Network fees are covered only on GroundTruth's staged devnet deals.",
          false,
        );
      }
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          `Send { action, account, ... }. Only ${SPONSORED_ACTIONS.join(", ")} are sponsored, for an assigned reviewer's wallet.`,
          false,
        );
      }
      const request = parsed.data as SponsoredTransactionRequest;
      if (!limiter.take(request.account)) {
        throw sponsorError(
          new SponsorUnavailable(
            429,
            "rateLimited",
            "Too many fee-covered requests just now. Wait a minute, or pay the fee from your wallet.",
          ),
        );
      }

      try {
        const answer = await buildSponsoredTransaction(
          { chain: options.chain, config, ledger: options.ledger },
          deal,
          request,
        );
        res.set("cache-control", "no-store").json(answer);
      } catch (error) {
        throw toHttpError(res, error);
      }
    }),
  ];

  return { status, transaction };
}

const BALANCE_TTL_MS = 30_000;
const BALANCE_READ_TIMEOUT_MS = 3_000;

/**
 * Whether the fee payer is under MIN_FEE_PAYER_LAMPORTS, read from devnet at
 * most once per `ttlMs`. A read that fails or is slow says "not low": the
 * POST still refuses with `outOfSol` when a simulation can't pay the fee.
 */
function feePayerLowBalance(
  chain: SponsorChain,
  feePayer: string,
  ttlMs: number,
  now: () => number,
): () => Promise<boolean> {
  let cached: { low: boolean; at: number } | undefined;
  let pending: Promise<boolean> | undefined;
  return async () => {
    if (cached && now() - cached.at < ttlMs) return cached.low;
    pending ??= withTimeout(chain.balance(feePayer), BALANCE_READ_TIMEOUT_MS)
      .then((lamports) => {
        const low = lamports < MIN_FEE_PAYER_LAMPORTS;
        cached = { low, at: now() };
        return low;
      })
      .catch(() => false)
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toHttpError(res: Response, error: unknown): unknown {
  const requestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : "unknown";
  if (error instanceof SponsoredSimulationFailed) {
    return new HttpError(
      409,
      "CONFLICT",
      error.message,
      false,
      error.programError === undefined
        ? undefined
        : { programError: String(error.programError) },
    );
  }
  if (error instanceof ActionRefusal) {
    return new HttpError(error.status, error.code, error.message, false);
  }
  if (error instanceof SponsorUnavailable) {
    if (error.reason === "misconfigured" || error.reason === "outOfSol") {
      logSafeFailure(requestId, error);
    }
    return sponsorError(error);
  }
  if (error instanceof ChainUnavailable) {
    logSafeFailure(requestId, error);
    return new HttpError(
      503,
      "PROVIDER_TIMEOUT",
      "Solana devnet couldn't be read just now, so nothing was signed. Try again in a moment.",
      true,
    );
  }
  if (error instanceof SponsorGuardRefused) {
    logSafeFailure(requestId, error);
    return new HttpError(
      500,
      "INTERNAL_ERROR",
      "GroundTruth refused to sign this transaction as fee payer.",
      false,
    );
  }
  return error;
}

function sponsorError(error: SponsorUnavailable): HttpError {
  return new HttpError(
    error.status,
    error.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
    error.message,
    error.status === 429,
    { sponsor: error.reason },
  );
}

/** A small JSON body; a bad or oversized one is a 400, not a 500. */
const rawParser = express.raw({ type: () => true, limit: "4kb" });
function rawJson(req: Request, res: Response, next: NextFunction): void {
  rawParser(req, res, (error?: unknown) => {
    if (error) {
      next(
        new HttpError(
          400,
          "INVALID_REQUEST",
          "The request body must be a small JSON object.",
          false,
        ),
      );
      return;
    }
    try {
      req.body = Buffer.isBuffer(req.body)
        ? (JSON.parse(req.body.toString("utf8")) as unknown)
        : undefined;
    } catch {
      req.body = undefined;
    }
    next();
  });
}

function isPublicKey(value: string): boolean {
  try {
    new web3.PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
