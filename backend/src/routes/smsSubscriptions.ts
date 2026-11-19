import { randomUUID } from "node:crypto";
import type { DealSmsSubscription, DealState } from "@groundtruth/shared";
import type { PrismaClient } from "@prisma/client";
import express, { type RequestHandler } from "express";
import { z } from "zod";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";
import { maskPhoneNumber, normalizePhoneNumber } from "../sms/phone.js";

/** A public staged deal is shared by QR code; this bounds how many numbers one deal can text. */
export const MAX_SUBSCRIPTIONS_PER_DEAL = 25;

const CLOSED: readonly DealState[] = ["released", "refunded"];

const dealIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const bodySchema = z.object({
  phoneNumber: z.string().max(32),
  consent: z.literal(true),
});

export interface SmsSubscriptionOptions {
  /** False when Twilio is not configured: every opt-in is refused. */
  enabled: boolean;
  now?: () => Date;
}

/**
 * POST /api/deals/:id/sms-subscriptions. Opts one phone number in to texts
 * about one public staged deal's future confirmed events. Answers with the
 * masked number only.
 */
export function createSmsSubscription(
  prisma: PrismaClient,
  options: SmsSubscriptionOptions,
): RequestHandler[] {
  const now = options.now ?? (() => new Date());
  return [
    express.raw({ type: () => true, limit: "4kb" }),
    asyncRoute(async (req, res) => {
      if (!options.enabled) {
        throw new HttpError(
          503,
          "INTERNAL_ERROR",
          "Text updates are not switched on for this server.",
          false,
        );
      }

      const dealId = dealIdSchema.safeParse(readParam(req.params.id));
      if (!dealId.success) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Deal ID must be 1-64 letters, digits, hyphens, or underscores.",
          false,
        );
      }
      const body = bodySchema.safeParse(parseJson(req.body));
      if (!body.success) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Send a phone number and confirm you agree to staged demo texts.",
          false,
        );
      }
      const phoneNumber = normalizePhoneNumber(body.data.phoneNumber);
      if (!phoneNumber) {
        throw new HttpError(
          400,
          "INVALID_REQUEST",
          "Enter a 10-digit US number, or an international number starting with +.",
          false,
        );
      }

      const deal = await prisma.dealRecord.findUnique({
        where: { id: dealId.data },
        select: { id: true, state: true, publicDemo: true },
      });
      if (!deal || !deal.publicDemo) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "No public deal has this ID.",
          false,
        );
      }
      if (CLOSED.includes(deal.state as DealState)) {
        throw new HttpError(
          409,
          "CONFLICT",
          "This deal is closed. There are no more updates to text.",
          false,
        );
      }

      const existing = await prisma.smsSubscriptionRecord.findUnique({
        where: { dealId_phoneNumber: { dealId: deal.id, phoneNumber } },
        select: { id: true },
      });
      if (existing) {
        await prisma.smsSubscriptionRecord.update({
          where: { id: existing.id },
          data: { consentedAt: now() },
        });
      } else {
        const count = await prisma.smsSubscriptionRecord.count({
          where: { dealId: deal.id },
        });
        if (count >= MAX_SUBSCRIPTIONS_PER_DEAL) {
          throw new HttpError(
            409,
            "CONFLICT",
            "This demo deal has reached its limit of text subscribers.",
            false,
          );
        }
        await prisma.smsSubscriptionRecord.upsert({
          where: { dealId_phoneNumber: { dealId: deal.id, phoneNumber } },
          create: {
            id: randomUUID(),
            dealId: deal.id,
            phoneNumber,
            consentedAt: now(),
          },
          update: { consentedAt: now() },
        });
      }

      const answer: DealSmsSubscription = {
        dealId: deal.id,
        maskedPhoneNumber: maskPhoneNumber(phoneNumber),
      };
      res.status(existing ? 200 : 201).json(answer);
    }),
  ];
}

function parseJson(body: unknown): unknown {
  if (!Buffer.isBuffer(body)) return undefined;
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
}

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
