// Reads one transaction from a public Solana devnet RPC and finds the report
// fingerprints its Memo instructions name. No GroundTruth server, no key, no
// wallet. The page loads this module when the visitor asks to check, so
// web3.js stays out of the parcel page's first load.

import { MEMO_PROGRAM_IDS } from "@groundtruth/shared";
import { Connection } from "@solana/web3.js";
import { DEVNET_RPC } from "../review/escrowTx";
import { parseReportMemo } from "./reportHash";

const TIMEOUT_MS = 10_000;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

/** A transaction signature from pasted text: the signature itself or an Explorer link. */
export function signatureFromInput(value: string): string | null {
  const text = value.trim();
  const fromLink = /\/tx\/([^/?#]+)/.exec(text)?.[1];
  const candidate = fromLink ?? text;
  return BASE58_SIGNATURE.test(candidate) ? candidate : null;
}

/** The parts of a compiled transaction message this reader needs. */
export interface MessageLike {
  staticAccountKeys: readonly { toBase58(): string }[];
  compiledInstructions: readonly { programIdIndex: number; data: Uint8Array }[];
}

/**
 * Report fingerprints named by the message's top-level Memo instructions, in
 * order. Text from any other program is ignored, even if it looks like a memo.
 */
export function reportHashesInMessage(message: MessageLike): string[] {
  const decoder = new TextDecoder();
  const memoPrograms: readonly string[] = MEMO_PROGRAM_IDS;
  const hashes: string[] = [];
  for (const instruction of message.compiledInstructions) {
    const program =
      message.staticAccountKeys[instruction.programIdIndex]?.toBase58();
    if (!program || !memoPrograms.includes(program)) continue;
    const hash = parseReportMemo(decoder.decode(instruction.data));
    if (hash) hashes.push(hash);
  }
  return hashes;
}

export type MemoRead =
  /** Confirmed and successful. `hashes` may be empty: no report memo. */
  | {
      status: "read";
      signature: string;
      hashes: string[];
      /** The fee payer, the wallet that sent it. */
      sender: string;
      slot: number;
      blockTime: number | null;
    }
  /** It landed but failed, so it recorded nothing. */
  | { status: "failedOnChain"; signature: string; slot: number }
  /** Devnet has no confirmed transaction with this signature. */
  | { status: "notFound"; signature: string }
  /** The RPC could not be reached or refused the request. */
  | { status: "error" };

export async function readReportMemo(signature: string): Promise<MemoRead> {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const tx = await Promise.race([
      connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    if (!tx) return { status: "notFound", signature };
    if (tx.meta?.err)
      return { status: "failedOnChain", signature, slot: tx.slot };
    const message = tx.transaction.message;
    return {
      status: "read",
      signature,
      hashes: reportHashesInMessage(message),
      sender: message.staticAccountKeys[0]?.toBase58() ?? "",
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
    };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}
