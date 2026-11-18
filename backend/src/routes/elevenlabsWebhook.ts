import express, { type RequestHandler } from "express";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";
import {
  parseOwnerCallWebhook,
  type OwnerCall,
  type RecordResult,
} from "../voice/ownerCall.js";
import { verifyElevenLabsSignature } from "../webhooks/elevenlabsSignature.js";

export interface ElevenLabsWebhookOptions {
  /** Webhook signing secret. Unset means every delivery is refused. */
  secret: string | undefined;
  /** When set, calls from any other agent are acknowledged and ignored. */
  agentId?: string;
  record: (call: OwnerCall) => Promise<RecordResult>;
  now?: () => Date;
}

/**
 * ElevenLabs post-call webhooks. ElevenLabs counts only 200 as delivered,
 * retries 5xx/429/timeouts, and does not retry other 4xx.
 */
export function elevenLabsWebhook(
  options: ElevenLabsWebhookOptions,
): RequestHandler[] {
  return [
    // Raw bytes for the HMAC. 10 MB covers transcription payloads; audio
    // events are switched off for the agent and would be refused (413).
    express.raw({ type: () => true, limit: "10mb" }),
    asyncRoute(async (req, res) => {
      if (!options.secret) {
        throw new HttpError(
          503,
          "INTERNAL_ERROR",
          "Voice webhook is not configured.",
          true,
        );
      }

      const body: unknown = req.body;
      const header = req.get("elevenlabs-signature");
      const verified =
        Buffer.isBuffer(body) && header
          ? verifyElevenLabsSignature({
              secret: options.secret,
              header,
              body,
              now: (options.now ?? (() => new Date()))(),
            })
          : null;
      if (!verified?.ok) {
        throw new HttpError(
          401,
          "FORBIDDEN",
          "Voice webhook signature is missing, expired, or invalid.",
          false,
        );
      }

      const parsed = parseOwnerCallWebhook(parseJson(body as Buffer));
      if (!parsed) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Voice webhook payload is not a post-call event GroundTruth reads.",
          false,
        );
      }

      if (parsed.kind === "ignored") {
        console.log(`elevenlabs ignored ${parsed.type}`);
      } else if (options.agentId && parsed.call.agentId !== options.agentId) {
        console.log(
          `elevenlabs ignored other agent ${parsed.call.conversationId}`,
        );
      } else {
        const result = await options.record(parsed.call);
        // IDs and the outcome only: never transcript text or phone numbers.
        console.log(
          `elevenlabs ${result} ${parsed.call.outcome} ${parsed.call.conversationId} deal=${parsed.call.dealId ?? "none"}`,
        );
      }
      res.status(200).json({ received: true });
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
