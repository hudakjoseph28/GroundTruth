// The GroundTruth fee-payer key for sponsored reviewer transactions: a
// devnet-only keypair, funded with devnet SOL, read from the server's
// environment. It pays network fees and nothing else, and it is never a
// party to a deal.
import { web3 } from "@anchor-lang/core";
import { stagedDemoDeals } from "@groundtruth/shared";

/** Most fee-payer signatures the API issues for one deal, ever (DB-enforced). */
export const DEFAULT_MAX_SPONSORED_PER_DEAL = 12;

export interface FeeSponsorConfig {
  keypair: web3.Keypair;
  /** Per-deal cap on issued fee-payer signatures (resend attempts count). */
  maxPerDeal: number;
}

/** Every wallet and token account bound to a staged deal. */
export function stagedParticipants(): Set<string> {
  return new Set(
    stagedDemoDeals.flatMap((deal) => [
      deal.buyerWallet,
      deal.sellerWallet,
      deal.sellerTokenAccount,
      deal.escrowAddress,
      ...deal.reviewers.map((r) => r.wallet),
    ]),
  );
}

/**
 * FEE_SPONSOR_SECRET_KEY (a solana-keygen JSON array of 64 bytes) and
 * FEE_SPONSOR_MAX_PER_DEAL. Unset key: sponsorship is off and reviewers pay
 * their own fees. A malformed key, or one that is a staged participant,
 * stops the API at startup rather than signing with the wrong key.
 */
export function readFeeSponsor(
  source: NodeJS.ProcessEnv,
  participants: ReadonlySet<string> = stagedParticipants(),
): FeeSponsorConfig | undefined {
  const raw = source.FEE_SPONSOR_SECRET_KEY?.trim();
  const maxPerDeal = readCap(source.FEE_SPONSOR_MAX_PER_DEAL);
  if (!raw) return undefined;

  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch {
    bytes = undefined;
  }
  if (
    !Array.isArray(bytes) ||
    bytes.length !== 64 ||
    !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
  ) {
    throw new Error(
      "FEE_SPONSOR_SECRET_KEY must be a solana-keygen JSON array of 64 bytes",
    );
  }
  let keypair: web3.Keypair;
  try {
    keypair = web3.Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
  } catch {
    throw new Error("FEE_SPONSOR_SECRET_KEY is not a valid ed25519 keypair");
  }
  if (participants.has(keypair.publicKey.toBase58())) {
    throw new Error(
      "FEE_SPONSOR_SECRET_KEY must be a dedicated key, not a staged deal participant",
    );
  }
  return { keypair, maxPerDeal };
}

function readCap(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_MAX_SPONSORED_PER_DEAL;
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("FEE_SPONSOR_MAX_PER_DEAL must be an integer");
  }
  const cap = Number(value);
  if (cap < 1 || cap > 100) {
    throw new Error("FEE_SPONSOR_MAX_PER_DEAL must be between 1 and 100");
  }
  return cap;
}
