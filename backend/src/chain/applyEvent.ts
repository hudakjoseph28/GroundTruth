import { Prisma, type PrismaClient } from "@prisma/client";
import type { DealState, Hold, ReviewerRole } from "@groundtruth/shared";
import type { ConfirmedEvent, ProgramEvent } from "./programEvents.js";
import { formatUsdc } from "./usdc.js";
import { queueSmsAlerts } from "../sms/alerts.js";

export type ApplyResult = "applied" | "duplicate" | "unknownDeal";

/**
 * The state a deal must be in for each event, mirroring Escrow v1. A
 * confirmed event that arrives in any other state means the API's copy has
 * drifted from the chain; that fails loudly instead of being papered over.
 *
 * A rejected release has no entry: the program refused it, so it records a
 * timeline row in whatever state the deal is in and changes nothing.
 */
const TRANSITIONS: Record<
  Exclude<ProgramEvent["name"], "ReleaseRejected">,
  { from: DealState; to: DealState }
> = {
  DealInitialized: { from: "draft", to: "draft" },
  DealFunded: { from: "draft", to: "funded" },
  ApprovalSigned: { from: "funded", to: "funded" },
  HoldPlaced: { from: "funded", to: "held" },
  DealReleased: { from: "funded", to: "released" },
  DealRefunded: { from: "held", to: "refunded" },
};

const HOLD_MESSAGES: Record<Hold["reasonCode"], string> = {
  SELLER_IDENTITY_DISPUTED:
    "The reviewer could not confirm that the seller is authorized to sell. Payment to the seller is blocked.",
  TITLE_EXCEPTION:
    "The reviewer found a title exception. Payment to the seller is blocked.",
  SITE_REVIEW_FAILED:
    "The site review did not pass. Payment to the seller is blocked.",
  OTHER: "The reviewer placed a hold. Payment to the seller is blocked.",
};

export class ChainDriftError extends Error {
  override name = "ChainDriftError";
}

/**
 * Projects one confirmed program event into PostgreSQL, exactly once.
 *
 * The timeline row (unique by signature + event index) and every state
 * change are written in one transaction, so a replayed delivery either
 * finds the row and does nothing or loses the unique-constraint race and
 * rolls back. Events for a deal PDA the API does not know are skipped.
 */
export async function applyConfirmedEvent(
  prisma: PrismaClient,
  confirmed: ConfirmedEvent,
): Promise<ApplyResult> {
  try {
    return await prisma.$transaction((tx) => applyInTransaction(tx, confirmed));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}

async function applyInTransaction(
  tx: Prisma.TransactionClient,
  {
    signature,
    slot,
    blockTime,
    eventIndex,
    event,
    documentSha256,
  }: ConfirmedEvent,
): Promise<ApplyResult> {
  const existing = await tx.timelineEventRecord.findUnique({
    where: {
      transactionSignature_eventIndex: {
        transactionSignature: signature,
        eventIndex,
      },
    },
    select: { id: true },
  });
  if (existing) return "duplicate";

  const deal = await tx.dealRecord.findUnique({
    where: { escrowAddress: event.dealPda },
    include: { reviewers: true },
  });
  if (!deal) return "unknownDeal";

  const transition =
    event.name === "ReleaseRejected"
      ? { from: deal.state as DealState, to: deal.state as DealState }
      : TRANSITIONS[event.name];
  if (deal.state !== transition.from) {
    throw new ChainDriftError(
      `${event.name} arrived while the stored deal is ${deal.state}`,
    );
  }

  const at = new Date(blockTime * 1000);
  const amount =
    "amountBaseUnits" in event
      ? requireAmount(event.amountBaseUnits, deal.amountBaseUnits)
      : deal.amountBaseUnits;
  let actorRole: string;
  let buyerMessage: string;

  switch (event.name) {
    case "DealInitialized":
      actorRole = "buyer";
      buyerMessage =
        "The escrow for this deal was created on Solana devnet. No funds have moved.";
      break;
    case "DealFunded":
      actorRole = "buyer";
      buyerMessage = `The buyer deposited ${formatUsdc(amount)} test USDC into escrow.`;
      break;
    case "ApprovalSigned": {
      const reviewer = requireReviewer(deal.reviewers, event);
      if (reviewer.approvedAt) {
        throw new ChainDriftError("Reviewer approval is already recorded");
      }
      await tx.reviewerRecord.update({
        where: { id: reviewer.id },
        data: { approvedAt: at, approvalTransaction: signature },
      });
      actorRole = event.role;
      buyerMessage = `The ${event.role} reviewer signed their approval.`;
      break;
    }
    case "HoldPlaced":
      requireReviewer(deal.reviewers, event);
      await tx.holdRecord.create({
        data: {
          dealId: deal.id,
          placedByWallet: event.reviewerWallet,
          role: event.role,
          reasonCode: event.reasonCode,
          buyerMessage: HOLD_MESSAGES[event.reasonCode],
          transactionSignature: signature,
          placedAt: at,
        },
      });
      actorRole = event.role;
      buyerMessage = HOLD_MESSAGES[event.reasonCode];
      break;
    case "DealReleased":
      if (event.destinationTokenAccount !== deal.sellerTokenAccount) {
        throw new ChainDriftError(
          "Release paid an account other than the seller's",
        );
      }
      actorRole = "escrow program";
      buyerMessage = `${formatUsdc(amount)} test USDC was paid to the seller.`;
      break;
    case "DealRefunded":
      actorRole = "buyer";
      buyerMessage = `${formatUsdc(amount)} test USDC was returned to the buyer.`;
      break;
    case "ReleaseRejected":
      actorRole = "escrow program";
      buyerMessage = rejectionMessage(event.errorName, event.errorNumber);
      break;
  }

  const eventId = `${signature}:${eventIndex}`;
  await tx.timelineEventRecord.create({
    data: {
      id: eventId,
      dealId: deal.id,
      at,
      type: TIMELINE_TYPES[event.name],
      actorRole,
      buyerMessage,
      transactionSignature: signature,
      eventIndex,
      slot: BigInt(slot),
      confirmationStatus: "confirmed",
      // Only an approval relies on a document; the hash is matched to the
      // deal's uploads when the deal is read (deals/mapDeal.ts).
      citedDocumentSha256:
        event.name === "ApprovalSigned" ? (documentSha256 ?? null) : null,
    },
  });
  await queueSmsAlerts(tx, {
    dealId: deal.id,
    eventId,
    eventName: event.name,
  });

  if (transition.to !== deal.state) {
    await tx.dealRecord.update({
      where: { id: deal.id },
      data: { state: transition.to },
    });
  }
  return "applied";
}

const TIMELINE_TYPES = {
  DealInitialized: "dealCreated",
  DealFunded: "funded",
  ApprovalSigned: "approvalSigned",
  HoldPlaced: "holdPlaced",
  DealReleased: "released",
  DealRefunded: "refunded",
  ReleaseRejected: "releaseRejected",
} as const satisfies Record<ProgramEvent["name"], string>;

/** Why the program refused a release, in the program's own error terms. */
const REJECTION_REASONS: Record<string, string> = {
  DealHeld: "a reviewer's hold is active",
  MissingRequiredApprovals: "not every required reviewer has approved",
  InvalidDealState: "the deal is not in a state that can be paid out",
};

function rejectionMessage(
  errorName: string | null,
  errorNumber: number | null,
): string {
  const reason = errorName ? REJECTION_REASONS[errorName] : undefined;
  const code = errorName
    ? ` Program error: ${errorName}${errorNumber === null ? "" : ` (${errorNumber})`}.`
    : "";
  return reason
    ? `A release was rejected on-chain because ${reason}. No funds moved.${code}`
    : `A release was rejected on-chain. No funds moved.${code}`;
}

function requireReviewer<T extends { wallet: string; role: string }>(
  reviewers: T[],
  event: { reviewerWallet: string; role: ReviewerRole },
): T {
  const reviewer = reviewers.find(
    (item) => item.wallet === event.reviewerWallet && item.role === event.role,
  );
  if (!reviewer) {
    throw new ChainDriftError("Signer is not a bound reviewer for this deal");
  }
  return reviewer;
}

function requireAmount(eventAmount: string, boundAmount: string): string {
  if (eventAmount !== boundAmount) {
    throw new ChainDriftError("Event amount differs from the bound amount");
  }
  return eventAmount;
}
