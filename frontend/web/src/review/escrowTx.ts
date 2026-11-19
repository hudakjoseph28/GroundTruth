import { Buffer } from "buffer";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAX_COMPUTE_UNITS,
  MAX_SEND_ATTEMPTS,
  NotLandedError,
  TOKEN_PROGRAM_ID,
  computeBudgetInstructions,
  computeUnitLimit,
  escrowErrorByCode,
  priorityFeeMicroLamports,
  sendUntilLanded,
  writableAccounts,
  type EscrowInstructionSpec,
  type SignatureState,
  type SignedAttempt,
} from "@groundtruth/shared";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import { REVIEW } from "../content/review";
import { encodeBase58 } from "../verify/idlDecode";

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

export type SendPhase = "checking" | "signing" | "sent" | "retrying";

/** Where the send is, for the status line. */
export interface SendProgress {
  phase: SendPhase;
  /** The signature of the transaction now in flight, once it is signed. */
  signature?: string;
  /** Attempt number (1 first; 2+ after a blockhash expired) and the limit. */
  attempt: number;
  of: number;
}

const toInstruction = (item: EscrowInstructionSpec) =>
  new TransactionInstruction({
    programId: new PublicKey(item.programId),
    keys: item.keys.map((key) => ({ ...key, pubkey: new PublicKey(key.pubkey) })),
    data: Buffer.from(item.data),
  });

/** This page's choice of unit price; zero if the fee read fails. */
async function recentPriorityFee(connection: Connection, accounts: string[]): Promise<number> {
  try {
    const recent = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: accounts.map((key) => new PublicKey(key)),
    });
    return priorityFeeMicroLamports(recent);
  } catch {
    return 0;
  }
}

/**
 * Builds the transaction on a fresh blockhash, with a capped priority fee
 * and a compute limit sized by a devnet simulation, and has the wallet sign.
 * A transaction the program would refuse never reaches the wallet prompt.
 */
async function buildAndSign(input: {
  connection: Connection;
  payer: PublicKey;
  instructions: EscrowInstructionSpec[];
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  beforeSigning: () => void;
}): Promise<SignedAttempt> {
  const { connection, payer, instructions } = input;
  const microLamports = await recentPriorityFee(connection, writableAccounts(instructions));
  const latest = await connection.getLatestBlockhash("confirmed");
  const compile = (units: number) =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer,
        recentBlockhash: latest.blockhash,
        instructions: [
          ...computeBudgetInstructions({ units, microLamports }),
          ...instructions,
        ].map(toInstruction),
      }).compileToV0Message(),
    );

  const simulation = await connection.simulateTransaction(compile(MAX_COMPUTE_UNITS), {
    sigVerify: false,
    commitment: "confirmed",
  });
  if (simulation.value.err) {
    throw new ActionError(explainFailure(simulation.value.err, simulation.value.logs));
  }
  const tx = compile(computeUnitLimit(simulation.value.unitsConsumed));

  input.beforeSigning();
  let signed: VersionedTransaction;
  try {
    signed = await input.signTransaction(tx);
  } catch (error) {
    throw new ActionError(explainFailure(error));
  }
  const signature = signed.signatures[0];
  if (!signature || signature.every((byte) => byte === 0)) {
    throw new ActionError(REVIEW.errors.unknown);
  }
  return {
    signature: encodeBase58(signature),
    serialized: signed.serialize(),
    lastValidBlockHeight: latest.lastValidBlockHeight,
  };
}

/** Thrown when an action fails after a transaction was signed and sent. */
export class SentActionError extends ActionError {
  constructor(
    message: string,
    readonly signature: string,
  ) {
    super(message);
  }
}

/**
 * Simulates, has the wallet sign, sends through our devnet connection (never
 * the wallet's own network), and resolves with the signature once devnet
 * confirms it. While waiting it rebroadcasts the same signed transaction; if
 * its blockhash expires unseen, which means it can never land, it reports
 * "retrying", builds the transaction again on a fresh blockhash, and asks the
 * wallet to sign once more (up to MAX_SEND_ATTEMPTS). Throws ActionError (or
 * SentActionError, carrying the signature) in plain words.
 */
export async function sendAndConfirm(input: {
  connection: Connection;
  payer: PublicKey;
  spec: EscrowInstructionSpec;
  /** More instructions for the same transaction, e.g. a document Memo after `sign_approval`. */
  extra?: EscrowInstructionSpec[];
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  onProgress: (progress: SendProgress) => void;
  signal?: AbortSignal;
  /** Test hooks: polling interval and sleep. */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const { connection } = input;
  const of = MAX_SEND_ATTEMPTS;
  input.onProgress({ phase: "checking", attempt: 1, of });
  await assertDevnet(connection);
  const instructions = [input.spec, ...(input.extra ?? [])];
  let retrying = false;
  let current: string | undefined;
  try {
    const landed = await sendUntilLanded({
      maxAttempts: of,
      signal: input.signal,
      pollMs: input.pollMs,
      sleep: input.sleep,
      prepare: (attempt) =>
        buildAndSign({
          connection,
          payer: input.payer,
          instructions,
          signTransaction: input.signTransaction,
          beforeSigning: () => {
            // A retry keeps saying "retrying" while the wallet asks again.
            if (!retrying) input.onProgress({ phase: "signing", attempt, of });
          },
        }),
      broadcast: async (serialized, first) => {
        await connection.sendRawTransaction(serialized, {
          // The first send is preflighted (a fresh simulation). Rebroadcasts
          // of the same bytes skip it: they only help the original land.
          skipPreflight: !first,
          preflightCommitment: "confirmed",
          maxRetries: 0,
        });
      },
      status: async (signature, deep) => {
        const { value } = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: deep,
        });
        const status = value[0];
        if (!status) return null;
        return {
          confirmationStatus: status.confirmationStatus ?? "processed",
          err: status.err,
        } as SignatureState;
      },
      blockHeight: () => connection.getBlockHeight("confirmed"),
      onEvent: (event) => {
        current = event.signature;
        if (event.kind === "sent") {
          retrying = false;
          input.onProgress({
            phase: "sent",
            signature: event.signature,
            attempt: event.attempt,
            of,
          });
        } else {
          retrying = true;
          input.onProgress({
            phase: "retrying",
            signature: event.signature,
            attempt: event.next,
            of: event.of,
          });
        }
      },
    });
    if (landed.err) {
      const tx = await connection
        .getTransaction(landed.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        })
        .catch(() => null);
      throw new SentActionError(
        explainFailure(landed.err, tx?.meta?.logMessages),
        landed.signature,
      );
    }
    return landed.signature;
  } catch (error) {
    if (error instanceof ActionError) throw error;
    if (error instanceof NotLandedError) {
      const message =
        error.reason === "expired" ? REVIEW.errors.expired(of) : REVIEW.errors.timeout;
      throw error.signature
        ? new SentActionError(message, error.signature)
        : new ActionError(message);
    }
    const message = explainFailure(error);
    throw current ? new SentActionError(message, current) : new ActionError(message);
  }
}
