// Every fee-payer signature the API hands out, one row each, and the
// per-deal cap on them. The cap counts issued signatures (resend attempts
// included), not landed ones, so it holds even if a transaction is never
// sent. PostgreSQL keeps it across restarts and deploys.
import type { PrismaClient } from "@prisma/client";
import type { SponsoredAction } from "@groundtruth/shared";

export interface SponsoredEntry {
  dealId: string;
  action: SponsoredAction;
  wallet: string;
  role: string | undefined;
  /** The fee payer's signature (the transaction ID). */
  signature: string;
}

export interface SponsorLedger {
  /** Records the entry and answers true, or answers false once `dealId` has `cap` entries. */
  record(entry: SponsoredEntry, cap: number): Promise<boolean>;
}

export function prismaSponsorLedger(prisma: PrismaClient): SponsorLedger {
  return {
    record: (entry, cap) =>
      prisma.$transaction(async (tx) => {
        // Serialize concurrent requests for one deal, so two cannot both
        // read count = cap - 1. Released at commit.
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${entry.dealId}))) AS l`;
        const issued = await tx.sponsoredFeeRecord.count({
          where: { dealId: entry.dealId },
        });
        if (issued >= cap) return false;
        await tx.sponsoredFeeRecord.create({
          data: {
            signature: entry.signature,
            dealId: entry.dealId,
            action: entry.action,
            wallet: entry.wallet,
            role: entry.role ?? null,
          },
        });
        return true;
      }),
  };
}

/** For tests and local runs without a database. */
export function memorySponsorLedger(): SponsorLedger & {
  entries: SponsoredEntry[];
} {
  const entries: SponsoredEntry[] = [];
  return {
    entries,
    async record(entry, cap) {
      if (entries.filter((e) => e.dealId === entry.dealId).length >= cap) {
        return false;
      }
      entries.push(entry);
      return true;
    },
  };
}
