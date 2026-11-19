import { prisma } from "../db.js";
import { toActivityEvent } from "../deals/mapDeal.js";
import { asyncRoute } from "../http/asyncRoute.js";

/** How many program events the homepage feed shows. */
export const ACTIVITY_LIMIT = 8;

/**
 * GET /api/activity: the newest confirmed program events across the public
 * staged deals. Read-only, and built only from timeline rows the QuickNode
 * projection wrote (`confirmed`, with a transaction); seeded and other
 * off-chain rows never appear. Newest first: block time, then slot and event
 * index, the reverse of a deal's own timeline order.
 */
export const getActivity = asyncRoute(async (_req, res) => {
  const rows = await prisma.timelineEventRecord.findMany({
    where: {
      confirmationStatus: "confirmed",
      transactionSignature: { not: null },
      deal: { publicDemo: true },
    },
    orderBy: [
      { at: "desc" },
      { slot: { sort: "desc", nulls: "last" } },
      { eventIndex: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ],
    take: ACTIVITY_LIMIT,
    select: {
      id: true,
      at: true,
      type: true,
      actorRole: true,
      buyerMessage: true,
      transactionSignature: true,
      confirmationStatus: true,
      deal: { select: { id: true, amountBaseUnits: true } },
    },
  });

  // Polled every few seconds; a cached copy would hide a new event.
  res.setHeader("cache-control", "no-store");
  res.json(rows.map(toActivityEvent));
});
