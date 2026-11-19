import { stagedDeal, stagedLiveDeal, stagedReleasedDeal } from "@groundtruth/shared";

/**
 * The three public closings the ticker reads. All three are on the golden
 * parcel, whose published street is Seaman Rd. The number is the order they
 * were opened on devnet on Nov 18, 2026: held, then released, then the live one.
 */
export const TICKER_DEALS = [
  { id: stagedDeal.id, label: "Seaman Rd · closing #1" },
  { id: stagedReleasedDeal.id, label: "Seaman Rd · closing #2" },
  { id: stagedLiveDeal.id, label: "Seaman Rd · closing #3" },
] as const;

export const TICKER = {
  label: "Solana devnet · live",
  region: "Recent escrow activity",
  explorer: "View transaction on Solana Explorer",
  /** How many of the newest real rows to keep. 14 so the held closing's hold, blocked release, and refund all stay; 12 would drop one of the two rows that share a timestamp. */
  limit: 14,
  pollMs: 15_000,
  dealPollMs: 2_000,
  freshMs: 6_000,
  phoneMs: 4_000,
} as const;
