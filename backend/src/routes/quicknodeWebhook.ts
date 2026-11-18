import express, { type RequestHandler } from "express";
import type { ApplyResult } from "../chain/applyEvent.js";
import type {
  ConfirmedEvent,
  TransactionDecoder,
} from "../chain/programEvents.js";
import {
  applyInOrder,
  decodeStreamPayload,
  StreamPayloadError,
} from "../chain/streamPayload.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";
import { verifyQuickNodeSignature } from "../webhooks/quicknodeSignature.js";

export interface QuickNodeWebhookOptions {
  /** Stream security token. Unset means every delivery is refused. */
  token: string | undefined;
  decode: TransactionDecoder;
  apply: (event: ConfirmedEvent) => Promise<ApplyResult>;
}

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

      // Decode the whole delivery first: a transaction the decoder cannot
      // read fails the delivery (500) before anything in it is applied.
      let events: ConfirmedEvent[];
      try {
        events = decodeStreamPayload(parseJson(body), options.decode);
      } catch (error) {
        if (!(error instanceof StreamPayloadError)) throw error;
        throw new HttpError(400, "INVALID_REQUEST", error.message, false);
      }
      await applyInOrder(events, options.apply, ({ event, result }) =>
        // Public chain data only. Railway's log timestamp is the receipt
        // time the Phase 3 proof records.
        console.log(
          `quicknode ${result} ${event.event.name} ${event.signature}:${event.eventIndex}`,
        ),
      );
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
