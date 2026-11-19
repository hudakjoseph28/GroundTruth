import type { TimelineEventType } from "@groundtruth/shared";

// Copy for the homepage's live devnet feed. Every row is a confirmed program
// event the API projected from Solana devnet; the copy says what happened in
// the program's terms and nothing more.

export const ACTIVITY = {
  title: "Live on Solana devnet",
  lede: "The latest confirmed escrow program events from the staged demo closings. Test USDC only; every row opens its transaction on Solana Explorer.",
  explorer: "View transaction on Solana Explorer",
  empty:
    "No confirmed devnet events yet. This list fills in as the escrow program confirms transactions.",
  loading: "Checking devnet…",
  failed: "Devnet activity couldn't be loaded. Trying again.",
  stale: "Couldn't refresh. Showing the last events loaded.",
  /** "10 test USDC deal". */
  deal: (amount: string) => `${amount} test USDC deal`,
  pollMs: 5_000,
  freshMs: 2_400,
} as const;

/** What a confirmed event says, keyed by type. `role` is the capitalized actor, e.g. "Septic". */
export const ACTIVITY_EVENTS: Record<
  TimelineEventType,
  (role: string | undefined) => string
> = {
  dealCreated: () => "Buyer opened the escrow",
  funded: () => "Buyer funded the escrow",
  evidenceReceived: () => "Evidence recorded",
  approvalSigned: (role) =>
    role ? `${role} reviewer approved` : "Reviewer approved",
  holdPlaced: (role) =>
    role ? `${role} reviewer placed a hold` : "Reviewer placed a hold",
  releaseRejected: () => "Program blocked a release",
  released: () => "Escrow paid the seller",
  refunded: () => "Escrow refunded the buyer",
};
