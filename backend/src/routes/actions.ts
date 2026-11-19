// Solana Actions (Blinks) for reviewer approval on the staged rehearsal deal.
// Spec: @solana/actions-spec 2.4 (GET metadata, POST { account } →
// unsigned transaction, ActionError bodies, actions.json, CORS on every
// Action route). The API never signs; the reviewer's wallet does.
import { web3 } from "@anchor-lang/core";
import { goldenParcel } from "@groundtruth/shared";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { z } from "zod";
import {
  ActionRefusal,
  BLINK_DEAL,
  ChainUnavailable,
  approvalFor,
  buildUnsignedApproval,
  closedReason,
  readChainDeal,
  usdc,
  type ChainDeal,
} from "../actions/approvalAction.js";
import type { ActionChain } from "../actions/devnetChain.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { logSafeFailure } from "../http/errors.js";

/** Solana devnet as a CAIP-2 chain ID (genesis hash truncated to 32 chars). */
export const DEVNET_CHAIN_ID = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const ACTION_VERSION = "2.4";

/** The CORS and Action headers the spec requires on actions.json and every Action route. */
export const ACTION_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": ACTION_VERSION,
  "X-Blockchain-Ids": DEVNET_CHAIN_ID,
};

const APPROVE_PATH = `/api/actions/approve/${BLINK_DEAL.id}`;

/** actions.json: the Action API, plus the web deal page unfurling as the Blink. */
export const ACTIONS_JSON = {
  rules: [
    { pathPattern: `/deals/${BLINK_DEAL.id}`, apiPath: APPROVE_PATH },
    { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
  ],
};

const accountSchema = z.object({
  account: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .refine(isPublicKey),
});

const TITLE = "GroundTruth · Staged devnet closing";
const LABEL = "Sign my approval";

function description(deal: ChainDeal | undefined): string {
  const base =
    `Reviewer sign-off for a staged test closing on ${goldenParcel.county} County parcel ${goldenParcel.sourceParcelId}. ` +
    `${usdc(BLINK_DEAL.amountBaseUnits)} test USDC is in escrow on Solana devnet. ` +
    "Connect the title, survey, or septic reviewer wallet bound to this deal and GroundTruth builds an unsigned approval for that wallet to sign; GroundTruth never signs for you. " +
    "Signing moves no money: the escrow program pays the seller only after every required reviewer signs and no hold is active. " +
    "Staged roles and test funds only.";
  if (!deal || deal.state !== "funded") return base;
  const required = deal.reviewers.filter((r) => r.required);
  const signed = required.filter((r) => r.approved).length;
  return `${base} On devnet now: funded, ${signed} of ${required.length} required approvals signed.`;
}

export function actionRoutes(chain: ActionChain) {
  const headers: RequestHandler = (_req, res, next) => {
    res.set(ACTION_HEADERS);
    next();
  };
  const preflight: RequestHandler = (_req, res) => {
    res.set(ACTION_HEADERS).status(204).end();
  };

  const actionsJson: RequestHandler = (_req, res) => {
    res.set(ACTION_HEADERS).json(ACTIONS_JSON);
  };

  const router = express.Router();
  router.use(headers);
  router.options("/{*path}", preflight);

  router.get("/icon.svg", (_req, res) => {
    res
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(ICON_SVG);
  });

  router.get(
    "/approve/:dealId",
    asyncRoute(async (req, res) => {
      requireBlinkDeal(req);
      let deal: ChainDeal | undefined;
      let error: string | undefined;
      try {
        deal = await readChainDeal(chain);
        error = closedReason(deal.state) ?? allSignedReason(deal);
      } catch (cause) {
        if (cause instanceof ActionRefusal) error = cause.message;
        // Devnet unreadable: show the Action; POST gives the real answer.
        else if (!(cause instanceof ChainUnavailable)) throw cause;
      }
      res.json({
        type: "action",
        icon: `${publicOrigin(req)}/api/actions/icon.svg`,
        title: TITLE,
        description: description(deal),
        label: LABEL,
        ...(error ? { disabled: true, error: { message: error } } : {}),
        links: {
          actions: [{ type: "transaction", label: LABEL, href: APPROVE_PATH }],
        },
      });
    }),
  );

  router.post(
    "/approve/:dealId",
    express.json({ limit: "4kb" }),
    asyncRoute(async (req, res) => {
      requireBlinkDeal(req);
      const parsed = accountSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ActionRefusal(
          400,
          "INVALID_REQUEST",
          "Send the wallet address as `account` (a base58 Solana public key).",
        );
      }
      const deal = await readChainDeal(chain);
      const reviewer = approvalFor(deal, parsed.data.account);
      const transaction = await buildUnsignedApproval(chain, reviewer);
      res.json({
        type: "transaction",
        transaction,
        message: `Approve as the ${reviewer.role} reviewer on the staged rehearsal deal (Solana devnet, test USDC). Your signature records your approval; it does not move funds.`,
      });
    }),
  );

  router.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      sendActionError(res, error);
    },
  );

  return { router, actionsJson, preflight };
}

function allSignedReason(deal: ChainDeal): string | undefined {
  return deal.reviewers.every((r) => r.approved)
    ? "Every reviewer has signed this deal on Solana devnet. Release to the seller is next; there is nothing left to approve."
    : undefined;
}

function requireBlinkDeal(req: Request): void {
  if (req.params.dealId !== BLINK_DEAL.id) {
    throw new ActionRefusal(
      404,
      "NOT_FOUND",
      "Approval Blinks are open only for the staged rehearsal deal.",
    );
  }
}

/** ActionError (`message`) plus the API's usual error envelope. */
function sendActionError(res: Response, error: unknown): void {
  const requestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : "unknown";
  let status: number;
  let code: string;
  let message: string;
  let retryable = false;
  if (error instanceof ActionRefusal) {
    ({ status, code, message } = error);
  } else if (isBodyParseError(error)) {
    status = 400;
    code = "INVALID_REQUEST";
    message = "The request body must be JSON with an `account` field.";
  } else if (error instanceof ChainUnavailable) {
    logSafeFailure(requestId, error);
    status = 503;
    code = "PROVIDER_TIMEOUT";
    message =
      "Solana devnet couldn't be read just now, so no transaction was built. Try again in a moment.";
    retryable = true;
  } else {
    logSafeFailure(requestId, error);
    status = 500;
    code = "INTERNAL_ERROR";
    message = "The approval could not be prepared. Try again in a moment.";
    retryable = true;
  }
  res
    .status(status)
    .json({ message, error: { code, message, requestId, retryable } });
}

function isBodyParseError(error: unknown): boolean {
  const type = (error as { type?: unknown } | null)?.type;
  return (
    type === "entity.parse.failed" ||
    type === "entity.too.large" ||
    type === "encoding.unsupported" ||
    type === "charset.unsupported"
  );
}

function isPublicKey(value: string): boolean {
  try {
    new web3.PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/** The absolute origin this request reached, for the spec's absolute icon URL. */
function publicOrigin(req: Request): string {
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwarded === "https" || forwarded === "http" ? forwarded : req.protocol;
  const host = req.get("host") ?? "";
  return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)
    ? `${proto}://${host}`
    : "https://groundtruth-lac.vercel.app";
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#050505"/>
  <g transform="translate(256 210) scale(9)" fill="none" stroke-linejoin="round">
    <path d="M0 -14.8 12.8 -7.4v14.8L0 14.8 -12.8 7.4v-14.8Z" stroke="#f5f5f7" stroke-width="1.2"/>
    <path d="M0 0 -12.8 -7.4M0 0l12.8 -7.4M0 0v14.8" stroke="#f5f5f7" stroke-width="0.9" stroke-opacity="0.6"/>
    <circle r="1.7" fill="#d1a84e" stroke="none"/>
  </g>
  <text x="256" y="400" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="#f5f5f7">Reviewer approval</text>
  <text x="256" y="446" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" letter-spacing="2" fill="#d1a84e">STAGED · SOLANA DEVNET · TEST USDC</text>
</svg>
`;
