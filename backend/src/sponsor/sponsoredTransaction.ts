// Builds a reviewer's sponsored `sign_approval`, `place_hold`, or `release`
// for one staged deal: GroundTruth's fee-payer key is the fee payer and the
// reviewer is the only other signer. The API signs ONLY as fee payer, after
// a devnet simulation passes and `sponsorRefusal` accepts the message; the
// reviewer's wallet adds its own signature and the escrow program checks it
// as always. Nothing here sends a transaction.
import { Buffer } from "node:buffer";
import { utils, web3 } from "@anchor-lang/core";
import {
  MAX_COMPUTE_UNITS,
  PRIORITY_FEE,
  computeBudgetInstructions,
  computeUnitLimit,
  documentMemoInstruction,
  escrowErrorByCode,
  placeHoldInstruction,
  priorityFeeMicroLamports,
  releaseInstruction,
  signApprovalInstruction,
  sponsorRefusal,
  writableAccounts,
  type EscrowInstructionSpec,
  type SponsoredMessageView,
  type SponsoredTransactionRequest,
  type SponsoredTransactionResponse,
} from "@groundtruth/shared";
import {
  ActionRefusal,
  closedReason,
  readDealAccount,
  type ChainDealAccount,
} from "../actions/approvalAction.js";
import type { SponsorChain } from "../actions/devnetChain.js";
import type { FeeSponsorConfig } from "./feePayer.js";
import type { SponsorLedger } from "./ledger.js";

/** The staged deal a request names: its PDA and on-chain deal ID. */
export interface SponsorableDeal {
  id: string;
  escrowAddress: string;
  dealIdHex: string;
}

/** GroundTruth cannot cover this fee (off, capped, out of SOL): the wallet may pay instead. */
export class SponsorUnavailable extends Error {
  override name = "SponsorUnavailable";
  constructor(
    readonly status: 429 | 503,
    readonly reason:
      | "off"
      | "rateLimited"
      | "dealCap"
      | "outOfSol"
      | "misconfigured",
    message: string,
  ) {
    super(message);
  }
}

/** The program would refuse this (seen in simulation), so no fee is spent on it. */
export class SponsoredSimulationFailed extends ActionRefusal {
  constructor(
    message: string,
    readonly programError: number | undefined,
  ) {
    super(409, "CONFLICT", message);
  }
}

/** The built message failed the sponsor guard. Never signed. */
export class SponsorGuardRefused extends Error {
  override name = "SponsorGuardRefused";
}

export interface SponsorDeps {
  chain: SponsorChain;
  config: FeeSponsorConfig;
  ledger: SponsorLedger;
}

/** The compiled message as the shared guard reads it. */
export function messageView(
  message: web3.VersionedMessage,
): SponsoredMessageView {
  return {
    accountKeys: message.staticAccountKeys.map((key) => key.toBase58()),
    numRequiredSignatures: message.header.numRequiredSignatures,
    addressTableLookups: message.addressTableLookups.length,
    instructions: message.compiledInstructions.map((ix) => ({
      programIdIndex: ix.programIdIndex,
      accountKeyIndexes: ix.accountKeyIndexes,
      data: ix.data,
    })),
  };
}

export async function buildSponsoredTransaction(
  deps: SponsorDeps,
  deal: SponsorableDeal,
  request: SponsoredTransactionRequest,
): Promise<SponsoredTransactionResponse> {
  const { chain, config, ledger } = deps;
  const feePayer = config.keypair.publicKey;
  const wallet = request.account;

  const onChain = await readDealAccount(chain, deal);
  if (participants(onChain, deal).has(feePayer.toBase58())) {
    // Never pay for (or sign beside) a deal the fee payer is part of.
    throw new SponsorUnavailable(
      503,
      "misconfigured",
      "GroundTruth can't cover the network fee for this deal.",
    );
  }
  const specs = instructionsFor(onChain, deal, request);

  const microLamports = await chain
    .recentPriorityFees(writableAccounts(specs))
    .then((recent) => priorityFeeMicroLamports(recent))
    .catch(() => 0);
  const latest = await chain.blockhash();
  const compile = (units: number) =>
    new web3.VersionedTransaction(
      new web3.TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: latest.blockhash,
        instructions: [
          ...computeBudgetInstructions({ units, microLamports }),
          ...specs,
        ].map(toInstruction),
      }).compileToV0Message(),
    );

  // A transaction that fails on chain still costs its fee: simulate first.
  const simulation = await chain.simulate(compile(MAX_COMPUTE_UNITS));
  if (simulation.err) refuseSimulation(simulation.err, simulation.logs);
  const tx = compile(computeUnitLimit(simulation.unitsConsumed));

  const refusal = sponsorRefusal(messageView(tx.message), {
    feePayer: feePayer.toBase58(),
    wallet,
    dealPda: deal.escrowAddress,
    maxMicroLamports: PRIORITY_FEE.maxMicroLamports,
  });
  if (refusal) throw new SponsorGuardRefused(refusal);

  tx.sign([config.keypair]);
  const signature = utils.bytes.bs58.encode(tx.signatures[0]!);
  const recorded = await ledger.record(
    {
      dealId: deal.id,
      action: request.action,
      wallet,
      role: request.action === "release" ? undefined : request.role,
      signature,
    },
    config.maxPerDeal,
  );
  if (!recorded) {
    throw new SponsorUnavailable(
      429,
      "dealCap",
      "GroundTruth has covered as many network fees on this deal as it will.",
    );
  }
  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    feePayer: feePayer.toBase58(),
    signature,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    action: request.action,
  };
}

/** Every key bound to the deal on chain, plus the staged fixture's PDA. */
function participants(deal: ChainDealAccount, staged: SponsorableDeal) {
  return new Set([
    staged.escrowAddress,
    deal.buyer,
    deal.seller,
    deal.sellerTokenAccount,
    deal.vault,
    deal.mint,
    ...deal.reviewers.map((r) => r.wallet),
  ]);
}

/**
 * The instruction specs for the request, after the same checks the program
 * makes, so a request it would refuse is answered before any devnet call.
 */
function instructionsFor(
  deal: ChainDealAccount,
  staged: SponsorableDeal,
  request: SponsoredTransactionRequest,
): EscrowInstructionSpec[] {
  const closed = closedReason(deal.state);
  if (closed) throw new ActionRefusal(409, "CONFLICT", closed);
  // The program checks the first assignment for the wallet.
  const assignment = deal.reviewers.find((r) => r.wallet === request.account);
  if (!assignment) {
    throw new ActionRefusal(
      403,
      "FORBIDDEN",
      "This wallet isn't an assigned reviewer on this deal, so GroundTruth won't cover its fee.",
    );
  }
  const dealPda = staged.escrowAddress;

  switch (request.action) {
    case "sign_approval": {
      requireRole(assignment.role, request.role);
      if (assignment.approved) {
        throw new ActionRefusal(
          409,
          "CONFLICT",
          "This wallet already signed its approval on Solana devnet.",
        );
      }
      const specs = [
        signApprovalInstruction({
          reviewer: request.account,
          dealPda,
          role: request.role,
        }),
      ];
      if (request.documentSha256) {
        specs.push(
          documentMemoInstruction({
            signer: request.account,
            sha256: request.documentSha256,
          }),
        );
      }
      return specs;
    }
    case "place_hold":
      requireRole(assignment.role, request.role);
      return [
        placeHoldInstruction({
          reviewer: request.account,
          dealPda,
          role: request.role,
          reasonCode: request.reasonCode,
        }),
      ];
    case "release": {
      const required = deal.reviewers.filter((r) => r.required);
      if (required.length === 0 || !required.every((r) => r.approved)) {
        throw new ActionRefusal(
          409,
          "CONFLICT",
          "Not every required reviewer has signed yet, so the deal can't be released.",
        );
      }
      return [
        releaseInstruction({
          payer: request.account,
          dealPda,
          seller: deal.seller,
          sellerTokenAccount: deal.sellerTokenAccount,
          buyer: deal.buyer,
          vault: deal.vault,
          mint: deal.mint,
        }),
      ];
    }
  }
}

function requireRole(assigned: string, asked: string): void {
  if (assigned !== asked) {
    throw new ActionRefusal(
      403,
      "FORBIDDEN",
      `This wallet reviews this deal as ${assigned}, not ${asked}.`,
    );
  }
}

/** Fee payer out of SOL is ours to fix; a program error is the request's. */
function refuseSimulation(err: unknown, logs: string[] | null): never {
  const text = JSON.stringify(err) ?? "";
  if (/InsufficientFundsForFee|AccountNotFound/.test(text)) {
    throw new SponsorUnavailable(
      503,
      "outOfSol",
      "GroundTruth's fee account is out of devnet SOL right now.",
    );
  }
  const code = programErrorCode(err, logs);
  const named = code === undefined ? undefined : escrowErrorByCode(code);
  throw new SponsoredSimulationFailed(
    named
      ? `The escrow program would refuse this: ${named.message}`
      : "Solana devnet would refuse this transaction, so GroundTruth didn't sign it.",
    code,
  );
}

function programErrorCode(
  err: unknown,
  logs: string[] | null,
): number | undefined {
  const custom = (err as { InstructionError?: [number, { Custom?: unknown }] })
    ?.InstructionError?.[1]?.Custom;
  if (typeof custom === "number") return custom;
  for (const line of logs ?? []) {
    const match = /Error Number: (\d+)\./.exec(line);
    if (match) return Number(match[1]);
  }
  return undefined;
}

const toInstruction = (spec: EscrowInstructionSpec) =>
  new web3.TransactionInstruction({
    programId: new web3.PublicKey(spec.programId),
    keys: spec.keys.map((key) => ({
      ...key,
      pubkey: new web3.PublicKey(key.pubkey),
    })),
    data: Buffer.from(spec.data),
  });
