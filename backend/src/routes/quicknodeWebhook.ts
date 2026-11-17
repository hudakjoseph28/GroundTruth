import express, { type RequestHandler } from "express";
import { z } from "zod";
import type { ApplyResult } from "../chain/applyEvent.js";
import {
  toConfirmedEvents,
  type ConfirmedEvent,
  type TransactionDecoder,
} from "../chain/programEvents.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";
import { verifyQuickNodeSignature } from "../webhooks/quicknodeSignature.js";

export interface QuickNodeWebhookOptions {
  /** Stream security token. Unset means every delivery is refused. */
  token: string | undefined;
  decode: TransactionDecoder;
  apply: (event: ConfirmedEvent) => Promise<ApplyResult>;
}

const base58Key = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

/**
 * The body our Stream filter returns, in block order: successful
 * transactions that touched the GroundTruth program, and failed ones whose
 * failing instruction was a GroundTruth `release` (with that instruction's
 * accounts, so the deal can be found). Keep in sync with
 * quicknode/groundtruth-filter.js and backend/README.md.
 */
const payloadSchema = z.object({
  transactions: z.array(
    z
      .object({
        signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
        slot: z.number().int().nonnegative(),
        blockTime: z.number().int().positive(),
        logMessages: z.array(z.string()),
        err: z.unknown().optional(),
        releaseAccounts: z.array(base58Key).min(2).optional(),
      })
      .refine(
        (tx) =>
          tx.err === undefined || tx.err === null
            ? tx.releaseAccounts === undefined
            : tx.releaseAccounts !== undefined,
        "A failed transaction carries its release accounts; a successful one does not",
      ),
  ),
});

export function quickNodeWebhook(
  options: QuickNodeWebhookOptions,
): RequestHandler[] {
  return [
    // Raw bytes for the HMAC; body-parser inflates gzip deliveries first.
    express.raw({ type: () => true, limit: "5mb" }),
    asyncRoute(async (req, res) => {
      if (!options.token) {
        throw new HttpError(
          503,
          "INTERNAL_ERROR",
          "Stream webhook is not configured.",
          true,
        );
      }

      const body: unknown = req.body;
      const nonce = req.get("x-qn-nonce");
      const timestamp = req.get("x-qn-timestamp");
      const signature = req.get("x-qn-signature");
      if (
        !Buffer.isBuffer(body) ||
        !nonce ||
        !timestamp ||
        !signature ||
        !verifyQuickNodeSignature({
          token: options.token,
          nonce,
          timestamp,
          body,
          signature,
        })
      ) {
        throw new HttpError(
          401,
          "FORBIDDEN",
          "Stream signature is missing or invalid.",
          false,
        );
      }

      const parsed = payloadSchema.safeParse(parseJson(body));
      if (!parsed.success) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Stream payload does not match the GroundTruth filter output.",
          false,
        );
      }

      // Decode the whole delivery first: a transaction the decoder cannot
      // read fails the delivery (500) before anything in it is applied.
      const events = parsed.data.transactions.flatMap((tx) =>
        toConfirmedEvents(tx, options.decode),
      );
      // Sequential on purpose: events must apply in chain order.
      for (const event of events) {
        const result = await options.apply(event);
        // Public chain data only. Railway's log timestamp is the receipt
        // time the Phase 3 proof records.
        console.log(
          `quicknode ${result} ${event.event.name} ${event.signature}:${event.eventIndex}`,
        );
      }
      res.status(204).end();
    }),
  ];
}

function parseJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
}
