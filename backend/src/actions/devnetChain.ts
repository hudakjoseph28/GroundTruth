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

export function createDevnetChain(
  rpcUrl: string = DEFAULT_SOLANA_RPC_URL,
): ActionChain {
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
  };
}
