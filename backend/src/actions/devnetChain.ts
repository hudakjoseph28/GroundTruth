import { web3 } from "@anchor-lang/core";

/** Solana devnet's genesis hash; every Action read refuses any other cluster. */
export const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

/** Public devnet RPC: no secret, read-only use. */
export const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

/**
 * The three chain reads the reviewer Action needs. The API reads devnet and
 * builds an unsigned transaction; it never signs or sends one.
 */
export interface ActionChain {
  genesisHash(): Promise<string>;
  /** The account's owner and data at `confirmed`, or null if it does not exist. */
  account(address: string): Promise<{ owner: string; data: Uint8Array } | null>;
  latestBlockhash(): Promise<string>;
}

/** A devnet simulation's answer, as the sponsor route needs it. */
export interface Simulation {
  err: unknown;
  logs: string[] | null;
  unitsConsumed: number | undefined;
}

/**
 * The extra devnet reads fee sponsorship needs: a blockhash with its expiry,
 * recent priority fees, and a simulation. Still read-only; the sponsor route
 * signs as fee payer itself and never sends.
 */
export interface SponsorChain extends ActionChain {
  blockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  /** An account's devnet balance in lamports, at `confirmed`. */
  balance(address: string): Promise<number>;
  recentPriorityFees(
    writable: string[],
  ): Promise<{ prioritizationFee: number }[]>;
  simulate(transaction: web3.VersionedTransaction): Promise<Simulation>;
}

export function createDevnetChain(
  rpcUrl: string = DEFAULT_SOLANA_RPC_URL,
): SponsorChain {
  const connection = new web3.Connection(rpcUrl, "confirmed");
  return {
    genesisHash: () => connection.getGenesisHash(),
    async account(address) {
      const info = await connection.getAccountInfo(
        new web3.PublicKey(address),
        "confirmed",
      );
      if (!info) return null;
      return { owner: info.owner.toBase58(), data: info.data };
    },
    async latestBlockhash() {
      return (await connection.getLatestBlockhash("confirmed")).blockhash;
    },
    blockhash: () => connection.getLatestBlockhash("confirmed"),
    balance: (address) =>
      connection.getBalance(new web3.PublicKey(address), "confirmed"),
    recentPriorityFees: (writable) =>
      connection.getRecentPrioritizationFees({
        lockedWritableAccounts: writable.map((key) => new web3.PublicKey(key)),
      }),
    async simulate(transaction) {
      const { value } = await connection.simulateTransaction(transaction, {
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: "confirmed",
      });
      return {
        err: value.err,
        logs: value.logs,
        unitsConsumed: value.unitsConsumed,
      };
    },
  };
}
