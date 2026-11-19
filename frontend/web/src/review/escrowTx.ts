import { Buffer } from "buffer";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  escrowErrorByCode,
  type EscrowInstructionSpec,
} from "@groundtruth/shared";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import { REVIEW } from "../content/review";

/** Public devnet RPC: no secret, and every transaction this page sends goes here. */
export const DEVNET_RPC = "https://api.devnet.solana.com";
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export const explorerTx = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

/** The deal's token vault: the deal PDA's associated token account for the mint. */
export function vaultFor(dealPda: string, mint: string): string {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(dealPda).toBuffer(),
      new PublicKey(TOKEN_PROGRAM_ID).toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0].toBase58();
}

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/** A program error code (6000+) from logs or an RPC error, if there is one. */
function programErrorCode(logs: readonly string[] | null | undefined, error?: unknown): number | null {
  for (const line of logs ?? []) {
    const anchor = /Error Number: (\d+)\./.exec(line);
    if (anchor) return Number(anchor[1]);
    const custom = /custom program error: 0x([0-9a-f]+)/i.exec(line);
    if (custom) return parseInt(custom[1]!, 16);
  }
  const custom = (error as { InstructionError?: [number, { Custom?: number }] } | null)
    ?.InstructionError?.[1]?.Custom;
  return typeof custom === "number" ? custom : null;
}

/** Plain words for why Solana or the wallet refused. */
export function explainFailure(error: unknown, logs?: readonly string[] | null): string {
  if (error instanceof ActionError) return error.message;
  const text = error instanceof Error ? `${error.name} ${error.message}` : JSON.stringify(error);
  if (/reject|declin|denied|cancel/i.test(text)) return REVIEW.errors.rejected;
  if (/InsufficientFundsForFee|no record of a prior credit|insufficient lamports/i.test(text + (logs ?? []).join(" "))) {
    return REVIEW.errors.noFee;
  }
  const code = programErrorCode(logs ?? (error as { logs?: string[] } | null)?.logs, error);
  if (code !== null) {
    const known = REVIEW.errors[code as keyof typeof REVIEW.errors];
    if (typeof known === "string") return known;
    const named = escrowErrorByCode(code);
    if (named) return REVIEW.errors.program(named.message);
  }
  return REVIEW.errors.unknown;
}

/** Refuses to run against anything but devnet. */
export async function assertDevnet(connection: Connection): Promise<void> {
  if ((await connection.getGenesisHash()) !== DEVNET_GENESIS) {
    throw new ActionError("This page only sends transactions to Solana devnet.");
  }
}

export type SendPhase = "checking" | "signing" | "sent";

/**
 * Simulates, has the wallet sign, then sends through our devnet connection
 * (never the wallet's own network), and resolves with the signature once
 * the transaction is broadcast. Throws ActionError in plain words.
 */
export async function signAndSend(input: {
  connection: Connection;
  payer: PublicKey;
  spec: EscrowInstructionSpec;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  onPhase: (phase: SendPhase) => void;
}): Promise<string> {
  const { connection, payer, spec } = input;
  input.onPhase("checking");
  await assertDevnet(connection);
  const instruction = new TransactionInstruction({
    programId: new PublicKey(spec.programId),
    keys: spec.keys.map((key) => ({ ...key, pubkey: new PublicKey(key.pubkey) })),
    data: Buffer.from(spec.data),
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: latest.blockhash,
      instructions: [instruction],
    }).compileToV0Message(),
  );

  // Ask devnet first, so a transaction the program would refuse never
  // reaches the wallet prompt.
  const simulation = await connection.simulateTransaction(tx, {
    sigVerify: false,
    commitment: "confirmed",
  });
  if (simulation.value.err) {
    throw new ActionError(explainFailure(simulation.value.err, simulation.value.logs));
  }

  input.onPhase("signing");
  let signed: VersionedTransaction;
  try {
    signed = await input.signTransaction(tx);
  } catch (error) {
    throw new ActionError(explainFailure(error));
  }
  try {
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      preflightCommitment: "confirmed",
    });
    input.onPhase("sent");
    return signature;
  } catch (error) {
    throw new ActionError(explainFailure(error));
  }
}

/**
 * Polls devnet until the transaction is confirmed (resolves) or fails on
 * chain (throws ActionError). Gives up after about a minute.
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (signal?.aborted) return;
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) {
      const tx = await connection
        .getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
        .catch(() => null);
      throw new ActionError(explainFailure(status.err, tx?.meta?.logMessages));
    }
    if (status && status.confirmationStatus !== "processed") return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new ActionError(REVIEW.errors.timeout);
}
