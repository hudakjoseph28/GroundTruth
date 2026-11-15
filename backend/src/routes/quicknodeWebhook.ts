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

/**
 * The body our Stream filter returns: confirmed transactions that touched
 * the GroundTruth program, in block order.
 */
const payloadSchema = z.object({
  transactions: z.array(
    z.object({
      signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
      slot: z.number().int().nonnegative(),
      blockTime: z.number().int().positive(),
      logMessages: z.array(z.string()),
    }),
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

      // Sequential on purpose: events must apply in chain order.
      for (const tx of parsed.data.transactions) {
        for (const event of toConfirmedEvents(tx, options.decode)) {
          await options.apply(event);
        }
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
