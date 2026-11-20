// The GroundTruth fee-payer key for sponsored reviewer transactions: a
// devnet-only keypair, funded with devnet SOL, read from the server's
// environment. It pays network fees and nothing else, and it is never a
// party to a deal.
import { utils, web3 } from "@anchor-lang/core";
import { stagedDemoDeals, type FeeSponsorOffReason } from "@groundtruth/shared";

/** Most fee-payer signatures the API issues for one deal, ever (DB-enforced). */
export const DEFAULT_MAX_SPONSORED_PER_DEAL = 12;

/**
 * Below this devnet balance `GET /api/fee-sponsor` says `low_balance`:
 * 0.001 SOL, about 100 sponsored actions at 10,000 lamports each.
 */
export const MIN_FEE_PAYER_LAMPORTS = 1_000_000;

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

/** Why sponsorship is off because of the server's settings (never the key itself). */
export type FeeSponsorSetupReason = Exclude<FeeSponsorOffReason, "low_balance">;

/** Sponsorship as configured: a usable key, or the safe reason it is off. */
export type FeeSponsorSetup =
  | { config: FeeSponsorConfig; reason?: undefined }
  | { config?: undefined; reason: FeeSponsorSetupReason };

/**
 * FEE_SPONSOR_SECRET_KEY and FEE_SPONSOR_MAX_PER_DEAL. The key is a
 * solana-keygen JSON array of 64 bytes, or the same 64 bytes in base58 (a
 * wallet's "export private key"). Unset key: sponsorship is off and
 * reviewers pay their own fees. A malformed key or cap, or a key that is a
 * staged participant, also turns sponsorship off, with a reason that
 * `GET /api/fee-sponsor` reports, so the API never signs with the wrong key
 * and a bad setting is visible instead of taking the whole API down.
 */
export function readFeeSponsor(
  source: NodeJS.ProcessEnv,
  participants: ReadonlySet<string> = stagedParticipants(),
): FeeSponsorSetup {
  const raw = source.FEE_SPONSOR_SECRET_KEY?.trim();
  // No key: sponsorship is off, and nothing else here matters.
  if (!raw) return { reason: "missing_key" };
  const maxPerDeal = readCap(source.FEE_SPONSOR_MAX_PER_DEAL);
  if (maxPerDeal === undefined) return { reason: "bad_max_per_deal" };

  const bytes = secretKeyBytes(raw);
  if (!bytes) return { reason: "bad_key_format" };
  let keypair: web3.Keypair;
  try {
    keypair = web3.Keypair.fromSecretKey(bytes);
  } catch {
    // 64 bytes whose second half is not the first half's public key.
    return { reason: "bad_key_format" };
  }
  if (participants.has(keypair.publicKey.toBase58())) {
    return { reason: "participant_key" };
  }
  return { config: { keypair, maxPerDeal } };
}

/** The key's 64 bytes from a JSON array or base58, or undefined. */
function secretKeyBytes(raw: string): Uint8Array | undefined {
  // Railway and .env files sometimes keep the quotes around a pasted value.
  const value = raw.replace(/^(['"])(.*)\1$/s, "$2").trim();
  if (value.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 64 ||
      !parsed.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
    ) {
      return undefined;
    }
    return Uint8Array.from(parsed as number[]);
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) return undefined;
  try {
    const decoded = utils.bytes.bs58.decode(value);
    return decoded.length === 64 ? Uint8Array.from(decoded) : undefined;
  } catch {
    return undefined;
  }
}

/** One-line startup log for a setup; names the reason, never the key. */
export function describeFeeSponsor(setup: FeeSponsorSetup): string {
  if (setup.config) {
    return `Fee sponsorship on: devnet fee payer ${setup.config.keypair.publicKey.toBase58()}, ${setup.config.maxPerDeal} per deal`;
  }
  return `Fee sponsorship off: ${setup.reason} (see FEE_SPONSOR_SECRET_KEY in backend/README.md)`;
}

/** The per-deal cap: 1 to 100, default 12; undefined when malformed. */
function readCap(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_MAX_SPONSORED_PER_DEAL;
  }
  if (!/^\d+$/.test(value.trim())) return undefined;
  const cap = Number(value);
  return cap >= 1 && cap <= 100 ? cap : undefined;
}
