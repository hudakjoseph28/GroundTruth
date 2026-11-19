import {
  COMPUTE_BUDGET_PROGRAM_ID,
  PRIORITY_FEE,
  signApprovalInstruction,
  stagedRehearsalV2Deal,
} from "@groundtruth/shared";
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Keypair,
  TransactionInstruction,
  TransactionMessage,
  type Connection,
  type VersionedTransaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { REVIEW } from "../content/review";
import { encodeBase58 } from "../verify/idlDecode";
import { SentActionError, sendAndConfirm, type SendProgress } from "./escrowTx";

const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const reviewer = Keypair.generate();
const deal = stagedRehearsalV2Deal;
const spec = signApprovalInstruction({
  reviewer: reviewer.publicKey.toBase58(),
  dealPda: deal.escrowAddress,
  role: "septic",
});

/** Every instruction of a v0 transaction, decompiled. */
function instructionsOf(tx: VersionedTransaction): TransactionInstruction[] {
  return TransactionMessage.decompile(tx.message).instructions;
}

function budgetOf(tx: VersionedTransaction) {
  const budget = instructionsOf(tx).filter(
    (ix) => ix.programId.toBase58() === COMPUTE_BUDGET_PROGRAM_ID,
  );
  expect(budget).toHaveLength(2);
  return {
    units: ComputeBudgetInstruction.decodeSetComputeUnitLimit(budget[0]!).units,
    microLamports: Number(
      ComputeBudgetInstruction.decodeSetComputeUnitPrice(budget[1]!)
        .microLamports,
    ),
  };
}

/**
 * A devnet stand-in. Block height advances one per poll. `land(attempt)`
 * says which attempts the network ever sees: unseen ones expire.
 */
function fakeDevnet(opts: {
  fees?: number[];
  unitsConsumed?: number;
  land: (attempt: number) => boolean;
  onChainErr?: unknown;
  lifetime?: number;
}) {
  let height = 1_000;
  let attempt = 0;
  const lifetime = opts.lifetime ?? 3;
  const seen = new Set<string>();
  const sent: VersionedTransaction[] = [];
  const simulated: VersionedTransaction[] = [];
  const blockhashes: string[] = [];
  const feeQueries: string[][] = [];
  const connection = {
    getGenesisHash: async () => DEVNET_GENESIS,
    getRecentPrioritizationFees: async (config: {
      lockedWritableAccounts: { toBase58(): string }[];
    }) => {
      feeQueries.push(config.lockedWritableAccounts.map((k) => k.toBase58()));
      return (opts.fees ?? []).map((prioritizationFee, slot) => ({
        slot,
        prioritizationFee,
      }));
    },
    getLatestBlockhash: async () => {
      attempt += 1;
      const blockhash = Keypair.generate().publicKey.toBase58();
      blockhashes.push(blockhash);
      return { blockhash, lastValidBlockHeight: height + lifetime };
    },
    simulateTransaction: async (tx: VersionedTransaction) => {
      simulated.push(tx);
      return {
        context: { slot: 1 },
        value: {
          err: null,
          logs: [],
          unitsConsumed: opts.unitsConsumed ?? 20_000,
        },
      };
    },
    sendRawTransaction: async (bytes: Uint8Array) => {
      const tx = (
        await import("@solana/web3.js")
      ).VersionedTransaction.deserialize(bytes);
      const signature = encodeBase58(tx.signatures[0]!);
      if (!sent.some((s) => encodeBase58(s.signatures[0]!) === signature))
        sent.push(tx);
      if (opts.land(attempt)) seen.add(signature);
      return signature;
    },
    getSignatureStatuses: async (signatures: string[]) => ({
      context: { slot: 1 },
      value: signatures.map((signature) =>
        seen.has(signature)
          ? {
              slot: 1,
              confirmations: 1,
              err: opts.onChainErr ?? null,
              confirmationStatus: "confirmed",
            }
          : null,
      ),
    }),
    getBlockHeight: async () => (height += 1),
    getTransaction: async () => ({
      meta: {
        logMessages: ["Program log: AnchorError occurred. Error Number: 6016."],
      },
    }),
  };
  return {
    connection: connection as unknown as Connection,
    sent,
    simulated,
    blockhashes,
    feeQueries,
  };
}

function signer() {
  let calls = 0;
  return {
    calls: () => calls,
    signTransaction: async (tx: VersionedTransaction) => {
      calls += 1;
      tx.sign([reviewer]);
      return tx;
    },
  };
}

const run = (
  devnet: ReturnType<typeof fakeDevnet>,
  wallet: ReturnType<typeof signer>,
  progress: SendProgress[] = [],
) =>
  sendAndConfirm({
    connection: devnet.connection,
    payer: reviewer.publicKey,
    spec,
    signTransaction: wallet.signTransaction,
    onProgress: (p) => progress.push(p),
    pollMs: 0,
    sleep: async () => {},
  });

describe("sendAndConfirm", () => {
  it("adds a priority fee from recent fees and a compute limit from the simulation", async () => {
    const devnet = fakeDevnet({
      fees: [0, 0, 10, 20, 30, 40, 50, 60],
      unitsConsumed: 20_000,
      land: () => true,
    });
    const wallet = signer();
    const progress: SendProgress[] = [];
    const signature = await run(devnet, wallet, progress);

    expect(wallet.calls()).toBe(1);
    expect(devnet.sent).toHaveLength(1);
    const tx = devnet.sent[0]!;
    expect(signature).toBe(encodeBase58(tx.signatures[0]!));
    // 75th percentile of the eight slots, and 20,000 units + 20% + 1,000.
    expect(budgetOf(tx)).toEqual({ units: 25_000, microLamports: 40 });
    // Simulated at the ceiling, so the budget instructions' own cost counts.
    expect(budgetOf(devnet.simulated[0]!).units).toBe(1_400_000);
    // The escrow instruction itself follows, unchanged.
    expect(instructionsOf(tx).at(-1)!.programId.toBase58()).toBe(
      spec.programId,
    );
    // Fees are read for the accounts the transaction writes: the deal.
    expect(devnet.feeQueries[0]).toEqual([deal.escrowAddress]);
    expect(progress.map((p) => p.phase)).toEqual([
      "checking",
      "signing",
      "sent",
    ]);
    expect(progress.at(-1)).toMatchObject({ signature, attempt: 1 });
  });

  it("caps the priority fee", async () => {
    const devnet = fakeDevnet({
      fees: [5_000_000, 5_000_000],
      land: () => true,
    });
    await run(devnet, signer());
    expect(budgetOf(devnet.sent[0]!).microLamports).toBe(
      PRIORITY_FEE.maxMicroLamports,
    );
  });

  it("encodes the budget the way web3.js does", async () => {
    const devnet = fakeDevnet({
      fees: [7],
      unitsConsumed: 1000,
      land: () => true,
    });
    await run(devnet, signer());
    const [limit, price] = instructionsOf(devnet.sent[0]!);
    expect(limit!.data).toEqual(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 2200 }).data,
    );
    expect(price!.data).toEqual(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 7 }).data,
    );
  });

  it("resends on a fresh blockhash, signed again, when the first one expires unseen", async () => {
    const devnet = fakeDevnet({ land: (attempt) => attempt >= 2 });
    const wallet = signer();
    const progress: SendProgress[] = [];
    const signature = await run(devnet, wallet, progress);

    expect(wallet.calls()).toBe(2);
    expect(devnet.sent).toHaveLength(2);
    expect(devnet.blockhashes).toHaveLength(2);
    expect(devnet.sent[0]!.message.recentBlockhash).toBe(devnet.blockhashes[0]);
    expect(devnet.sent[1]!.message.recentBlockhash).toBe(devnet.blockhashes[1]);
    expect(signature).toBe(encodeBase58(devnet.sent[1]!.signatures[0]!));
    expect(progress.map((p) => p.phase)).toEqual([
      "checking",
      "signing",
      "sent",
      // The re-sign happens while the status still says "retrying".
      "retrying",
      "sent",
    ]);
    expect(progress[3]).toMatchObject({ phase: "retrying", attempt: 2, of: 3 });
    expect(progress[4]).toMatchObject({ phase: "sent", attempt: 2, signature });
  });

  it("gives up after three expired attempts, saying nothing moved", async () => {
    const devnet = fakeDevnet({ land: () => false });
    const wallet = signer();
    const error = await run(devnet, wallet).catch((e: unknown) => e);
    expect(wallet.calls()).toBe(3);
    expect(error).toBeInstanceOf(SentActionError);
    expect((error as Error).message).toBe(REVIEW.errors.expired(3));
  });

  it("reports an on-chain failure in plain words with its signature", async () => {
    const devnet = fakeDevnet({
      land: () => true,
      onChainErr: { InstructionError: [2, { Custom: 6016 }] },
    });
    const error = await run(devnet, signer()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SentActionError);
    expect((error as Error).message).toBe(REVIEW.errors[6016]);
    expect((error as SentActionError).signature).toBe(
      encodeBase58(devnet.sent[0]!.signatures[0]!),
    );
  });

  it("never sends when the wallet declines", async () => {
    const devnet = fakeDevnet({ land: () => true });
    const error = await sendAndConfirm({
      connection: devnet.connection,
      payer: reviewer.publicKey,
      spec,
      signTransaction: async () => {
        throw new Error("User rejected the request.");
      },
      onProgress: () => {},
      pollMs: 0,
      sleep: async () => {},
    }).catch((e: unknown) => e);
    expect((error as Error).message).toBe(REVIEW.errors.rejected);
    expect(devnet.sent).toHaveLength(0);
  });
});
