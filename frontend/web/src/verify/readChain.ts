import { PublicKey } from "@solana/web3.js";
import {
  DEAL_SEED,
  GROUNDTRUTH_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@groundtruth/shared";
import {
  decodeDealAccount,
  decodeTokenAccount,
  type ChainDeal,
  type TokenAccount,
} from "./dealAccount";
import { decodeBase64 } from "./idlDecode";

// Reads one deal's escrow account and its vault straight from a public Solana
// devnet RPC: no GroundTruth server, no key, no wallet. Only public account
// data is requested. The page loads this module when the visitor asks to
// verify, so web3.js (used here only to derive the PDA) stays out of the
// first load.

/** Public devnet RPC, the same one the reviewer portal sends to. No secret. */
export const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";

const TIMEOUT_MS = 10_000;

export type VaultRead =
  /** The program closes an emptied vault on release or refund. */
  | { status: "closed"; address: string }
  | { status: "foreign"; address: string; owner: string }
  | { status: "open"; address: string; token: TokenAccount };

export interface ChainSnapshot {
  rpc: string;
  /** The slot the deal account was read at; the vault is read at or after it. */
  slot: number;
  readAt: string;
  address: string;
  owner: string;
  deal: ChainDeal;
  /** The PDA the program would derive from the account's own buyer and deal ID. */
  derivedAddress: string;
  vault: VaultRead;
}

export type ChainRead =
  | { status: "read"; snapshot: ChainSnapshot }
  /** Nothing exists at the address. */
  | { status: "missing"; address: string; slot: number }
  /** An account exists, but the escrow program does not own it. */
  | { status: "foreign"; address: string; owner: string; slot: number }
  /** The program owns it, but its bytes are not a DealAccount the IDL decodes. */
  | { status: "undecodable"; address: string; reason: string; slot: number }
  /** The RPC could not be reached or answered with an error. */
  | { status: "error"; message: string };

interface RawAccount {
  owner: string;
  data: Uint8Array;
}

/** Reads the deal account, then its vault, from the RPC. Never throws. */
export async function readDealFromChain(
  address: string,
  options: { rpc?: string; fetch?: typeof fetch; now?: () => Date } = {},
): Promise<ChainRead> {
  const rpc = options.rpc ?? PUBLIC_DEVNET_RPC;
  const call = options.fetch ?? fetch;
  try {
    const dealRead = await getAccount(call, rpc, address);
    const slot = dealRead.slot;
    if (!dealRead.account) return { status: "missing", address, slot };
    const { owner, data } = dealRead.account;
    if (owner !== GROUNDTRUTH_PROGRAM_ID) {
      return { status: "foreign", address, owner, slot };
    }

    let deal: ChainDeal;
    try {
      deal = decodeDealAccount(data);
    } catch (error) {
      return {
        status: "undecodable",
        address,
        reason: error instanceof Error ? error.message : String(error),
        slot,
      };
    }

    const vaultRead = await getAccount(call, rpc, deal.vault, slot);
    let vault: VaultRead;
    if (!vaultRead.account) {
      vault = { status: "closed", address: deal.vault };
    } else if (vaultRead.account.owner !== TOKEN_PROGRAM_ID) {
      vault = {
        status: "foreign",
        address: deal.vault,
        owner: vaultRead.account.owner,
      };
    } else {
      vault = {
        status: "open",
        address: deal.vault,
        token: decodeTokenAccount(vaultRead.account.data),
      };
    }

    return {
      status: "read",
      snapshot: {
        rpc,
        slot,
        readAt: (options.now?.() ?? new Date()).toISOString(),
        address,
        owner,
        deal,
        derivedAddress: deriveDealAddress(deal.buyer, deal.dealId),
        vault,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : "The devnet RPC could not be reached.",
    };
  }
}

/** The PDA for seeds ["deal", buyer, deal_id] under the escrow program. */
export function deriveDealAddress(buyer: string, dealId: Uint8Array): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode(DEAL_SEED), new PublicKey(buyer).toBytes(), dealId],
    new PublicKey(GROUNDTRUTH_PROGRAM_ID),
  );
  return pda.toBase58();
}

async function getAccount(
  call: typeof fetch,
  rpc: string,
  address: string,
  minContextSlot?: number,
): Promise<{ slot: number; account: RawAccount | null }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await call(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [
          address,
          {
            encoding: "base64",
            commitment: "confirmed",
            ...(minContextSlot ? { minContextSlot } : {}),
          },
        ],
      }),
      signal: abort.signal,
    });
  } catch {
    throw new Error("The devnet RPC could not be reached.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`The devnet RPC answered HTTP ${response.status}.`);
  }
  const body = (await response.json()) as {
    error?: { message?: string };
    result?: {
      context?: { slot?: number };
      value?: { owner?: string; data?: [string, string] } | null;
    };
  };
  if (body.error) {
    throw new Error(
      `The devnet RPC refused the read: ${body.error.message ?? "unknown error"}.`,
    );
  }
  const slot = body.result?.context?.slot;
  if (typeof slot !== "number") {
    throw new Error("The devnet RPC answered without a slot.");
  }
  const value = body.result?.value;
  if (value === null || value === undefined) return { slot, account: null };
  const [encoded, encoding] = value.data ?? [];
  if (typeof value.owner !== "string" || typeof encoded !== "string" || encoding !== "base64") {
    throw new Error("The devnet RPC answered with an unreadable account.");
  }
  return { slot, account: { owner: value.owner, data: decodeBase64(encoded) } };
}
