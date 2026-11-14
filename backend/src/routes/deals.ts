import type { Deal } from "@groundtruth/shared";
import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { toDeal } from "../deals/mapDeal.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";

const dealIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);

export const getDeal = asyncRoute(async (req, res) => {
  res.json(await loadPublicDeal(req));
});

export const getDealTimeline = asyncRoute(async (req, res) => {
  const deal = await loadPublicDeal(req);
  res.json(deal.timeline);
});

async function loadPublicDeal(req: Request): Promise<Deal> {
  const parsed = dealIdSchema.safeParse(readDealId(req.params.id));
  if (!parsed.success) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Deal ID must be 1-64 letters, digits, hyphens, or underscores.",
      false,
    );
  }

  const deal = await prisma.dealRecord.findUnique({
    where: { id: parsed.data },
    include: {
      reviewers: { orderBy: { position: "asc" } },
      hold: true,
      // Contract order: chain slot / event index, then off-chain time.
      // Confirmed rows carry block time in `at`, so ordering by time first
      // interleaves off-chain evidence; slot and index break ties.
      timelineEvents: {
        orderBy: [
          { at: "asc" },
          { slot: { sort: "asc", nulls: "last" } },
          { eventIndex: { sort: "asc", nulls: "last" } },
          { id: "asc" },
        ],
      },
    },
  });

  // Non-demo deals answer exactly like missing ones so the route does not
  // reveal which private deal IDs exist.
  if (!deal || !deal.publicDemo) {
    throw new HttpError(404, "NOT_FOUND", "No public deal has this ID.", false);
  }

  return toDeal(deal);
}

function readDealId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
