import type { Prisma } from "@prisma/client";
import type { Deal } from "@groundtruth/shared";

/**
 * Upserts a staged demo deal from a shared fixture.
 *
 * Only values bound before funding (wallets, amount, mint, reviewers) and the
 * fixture's own off-chain timeline rows are written on re-seed. Deal state,
 * reviewer approvals, holds, and confirmed timeline rows are chain
 * projections, so re-running the seed never resets or deletes them.
 */
export async function seedDeal(
  tx: Prisma.TransactionClient,
  deal: Deal,
): Promise<void> {
  if (deal.timeline.some((event) => event.confirmationStatus === "confirmed")) {
    throw new Error("Fixtures may not seed confirmed chain events");
  }

  const binding = {
    parcelKey: deal.parcelKey,
    buyerWallet: deal.buyerWallet,
    sellerWallet: deal.sellerWallet,
    sellerTokenAccount: deal.sellerTokenAccount,
    amountBaseUnits: deal.amountBaseUnits,
    mint: deal.mint,
    cluster: deal.cluster,
    publicDemo: true,
  };

  await tx.dealRecord.upsert({
    where: { id: deal.id },
    create: {
      id: deal.id,
      ...binding,
      state: deal.state,
      escrowAddress: deal.escrowAddress ?? null,
    },
    update: {
      ...binding,
      ...(deal.escrowAddress ? { escrowAddress: deal.escrowAddress } : {}),
    },
  });

  const reviewerIds = deal.reviewers.map(
    (reviewer) => `${deal.id}:${reviewer.role}:${reviewer.wallet}`,
  );
  await tx.reviewerRecord.deleteMany({
    where: { dealId: deal.id, id: { notIn: reviewerIds } },
  });
  for (const [position, reviewer] of deal.reviewers.entries()) {
    await tx.reviewerRecord.upsert({
      where: { id: reviewerIds[position] },
      create: {
        id: reviewerIds[position]!,
        dealId: deal.id,
        position,
        wallet: reviewer.wallet,
        role: reviewer.role,
        required: reviewer.required,
      },
      update: { position, required: reviewer.required },
    });
  }

  for (const event of deal.timeline) {
    const row = {
      at: new Date(event.at),
      type: event.type,
      actorRole: event.actorRole ?? null,
      buyerMessage: event.buyerMessage,
      confirmationStatus: event.confirmationStatus,
    };
    await tx.timelineEventRecord.upsert({
      where: { id: event.id },
      create: { id: event.id, dealId: deal.id, ...row },
      update: row,
    });
  }
}
