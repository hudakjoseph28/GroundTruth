import type { Prisma, PrismaClient } from "@prisma/client";
import type { ConfirmedEvent, ProgramEvent } from "../chain/programEvents.js";
import { formatUsdc } from "../chain/usdc.js";
import type { SmsSender } from "./sender.js";

/** The confirmed events a subscriber is texted about. */
const ALERT_EVENTS = [
  "DealFunded",
  "HoldPlaced",
  "ReleaseRejected",
  "DealReleased",
] as const satisfies readonly ProgramEvent["name"][];

type AlertEvent = (typeof ALERT_EVENTS)[number];

/** Twilio refusals before an alert is given up on. A replayed delivery retries a refused text until then. */
export const MAX_SMS_ATTEMPTS = 3;

export function isAlertEvent(name: ProgramEvent["name"]): name is AlertEvent {
  return (ALERT_EVENTS as readonly string[]).includes(name);
}

/**
 * Queues one text per current subscriber of the deal, inside the same
 * transaction that writes the event's timeline row. The timeline row is
 * written exactly once per signature + event index, so these rows are too:
 * a replayed delivery never queues a second text.
 */
export async function queueSmsAlerts(
  tx: Prisma.TransactionClient,
  input: { dealId: string; eventId: string; eventName: ProgramEvent["name"] },
): Promise<void> {
  if (!isAlertEvent(input.eventName)) return;
  const subscriptions = await tx.smsSubscriptionRecord.findMany({
    where: { dealId: input.dealId },
    select: { id: true },
  });
  if (subscriptions.length === 0) return;
  await tx.smsAlertRecord.createMany({
    data: subscriptions.map((subscription) => ({
      eventId: input.eventId,
      subscriptionId: subscription.id,
    })),
  });
}

/** The text for one alert. Test funds are labeled; the link is the event's own transaction. */
export function alertText(
  name: AlertEvent,
  amountBaseUnits: string,
  signature: string,
): string {
  const amount = `${formatUsdc(amountBaseUnits)} test USDC`;
  const explorer = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  const what: Record<AlertEvent, string> = {
    DealFunded: `your ${amount} escrow was funded on Solana devnet.`,
    HoldPlaced: `a reviewer placed a hold on your ${amount} escrow. Payment to the seller is blocked.`,
    ReleaseRejected: `a release of your ${amount} escrow was rejected on-chain. No funds moved.`,
    DealReleased: `your ${amount} escrow was released to the seller.`,
  };
  return `GroundTruth: ${what[name]} Explorer: ${explorer}`;
}

export type DispatchOutcome = { sent: number; failed: number };

/**
 * Sends the pending texts for one projected event. Runs after the event's
 * transaction commits, on first delivery and on every replay, so a text
 * Twilio refused is retried by the next delivery of the same event.
 *
 * Each alert is claimed (pending -> sending) before it is sent, so two
 * concurrent deliveries never both send it, and a sent alert is never
 * sent again. A crash mid-send leaves it `sending`: at most one text.
 * Never throws; a text is evidence of chain state, not part of it.
 */
export function createSmsAlertDispatcher(
  prisma: PrismaClient,
  sender: SmsSender,
  log: (line: string) => void = (line) => console.log(line),
): (confirmed: ConfirmedEvent) => Promise<DispatchOutcome> {
  return async ({ signature, eventIndex, event }) => {
    const outcome: DispatchOutcome = { sent: 0, failed: 0 };
    if (!isAlertEvent(event.name)) return outcome;
    const eventId = `${signature}:${eventIndex}`;
    try {
      const pending = await prisma.smsAlertRecord.findMany({
        where: { eventId, status: "pending" },
        select: {
          subscriptionId: true,
          attempts: true,
          subscription: { select: { phoneNumber: true } },
          event: { select: { deal: { select: { amountBaseUnits: true } } } },
        },
        orderBy: { subscriptionId: "asc" },
      });
      for (const alert of pending) {
        const key = { eventId, subscriptionId: alert.subscriptionId };
        const claimed = await prisma.smsAlertRecord.updateMany({
          where: { ...key, status: "pending" },
          data: { status: "sending", attempts: { increment: 1 } },
        });
        if (claimed.count !== 1) continue;
        try {
          const { messageId } = await sender.send({
            to: alert.subscription.phoneNumber,
            body: alertText(
              event.name,
              alert.event.deal.amountBaseUnits,
              signature,
            ),
          });
          await prisma.smsAlertRecord.update({
            where: { eventId_subscriptionId: key },
            data: {
              status: "sent",
              providerMessageId: messageId,
              sentAt: new Date(),
            },
          });
          outcome.sent += 1;
        } catch (error) {
          const attempts = alert.attempts + 1;
          await prisma.smsAlertRecord.update({
            where: { eventId_subscriptionId: key },
            data: {
              status: attempts >= MAX_SMS_ATTEMPTS ? "failed" : "pending",
            },
          });
          outcome.failed += 1;
          log(
            `sms failed ${event.name} ${eventId} attempt ${attempts}: ${describe(error)}`,
          );
        }
      }
    } catch (error) {
      log(`sms dispatch error ${event.name} ${eventId}: ${describe(error)}`);
    }
    if (outcome.sent > 0)
      log(`sms sent ${event.name} ${eventId} x${outcome.sent}`);
    return outcome;
  };
}

/** Error name and message only; never a phone number or credential. */
function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : "UnknownError";
}
