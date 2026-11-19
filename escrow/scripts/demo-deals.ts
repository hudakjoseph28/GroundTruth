/**
 * Runs GroundTruth's two staged demo closings against the escrow program on
 * Solana devnet, built from the checked-in IDL with @solana/web3.js (no
 * Solana CLI).
 *
 *   pnpm --filter @groundtruth/escrow demo:deals                 # check (default)
 *   pnpm --filter @groundtruth/escrow demo:deals plan            # addresses, no tx
 *   pnpm --filter @groundtruth/escrow demo:deals stage-prep      # live deal, part 1
 *   pnpm --filter @groundtruth/escrow demo:deals stage-finish    # live deal, on stage
 *   ... demo:deals stage-prep --deal staged-devnet-deal-rehearsal-v3 # practise run
 *   pnpm --filter @groundtruth/escrow demo:deals stage-init      # Solana Pay rehearsal
 *   pnpm --filter @groundtruth/escrow demo:deals simulate        # local, no devnet tx
 *   pnpm --filter @groundtruth/escrow demo:deals run             # sends devnet txs
 *   ... demo:deals <mode> --amount 20                            # deal size in USDC
 *   ... demo:deals <mode> --held-error InvalidDealState          # see below
 *
 * Deal IDs are fixed: deal_id = sha256(STAGED_DEAL_ID_LABELS[outcome]) from
 * @groundtruth/shared ("groundtruth-demo-held-v1", "groundtruth-demo-released-v1"),
 * so each deal PDA is known before anything is sent and the backend's staged
 * deals (stagedDeal, stagedReleasedDeal) carry the same addresses. A PDA can
 * be initialized only once: `run` refuses if either already exists, and a
 * fresh pair needs new labels (and fixtures) such as "...-v2".
 *
 * Modes:
 *   plan      Prints each deal's deal_id, deal PDA, vault, wallets, reviewer
 *             roles, and token accounts, checks them against the shared
 *             fixtures, and reads whether the PDAs exist on devnet. Sends nothing.
 *   check     Generates (or loads) the demo keypairs, prints their public keys,
 *             reads SOL and USDC balances on devnet, and prints exactly what to
 *             fund. Sends nothing.
 *   simulate  Runs both closings in LiteSVM against the deployed program's
 *             own bytecode (read from devnet). The USDC mint is replaced by a
 *             local stand-in at Circle's address so the buyer can be funded;
 *             nothing touches devnet. Output: demo-results/simulation.* (gitignored).
 *   stage-prep    A stage deal (--deal, default staged-devnet-deal-live,
 *                 10 USDC): rehearses both halves locally, then sends
 *                 initialize, fund, and the title and survey approvals.
 *                 Never the septic approval, so it cannot be released yet.
 *                 Safe to re-run; skips what is on chain.
 *   stage-finish  Sends the septic approval and the release, live on stage,
 *                 with no rehearsal (stage-prep already rehearsed it) to keep
 *                 it fast. Refuses unless the deal is funded with title and
 *                 survey approved and no hold.
 *                 Records: demo-results/devnet-stage-live-v1.{json,md}, or
 *                 devnet-stage-rehearsal-v1 / -v2 / -v3 for the rehearsal deals.
 *   stage-init    Initializes a stage deal (--deal, default
 *                 staged-devnet-deal-pay-rehearsal, 1 USDC) and nothing
 *                 else, so it stays a draft for the buyer to fund from the
 *                 deal page's Solana Pay QR (the API builds the unsigned
 *                 fund; the buyer's wallet signs). No rehearsal: initialize
 *                 moves no USDC. Skips a deal already on chain. Sends through
 *                 the same priority-fee / resend loop as every other mode.
 *                 Records: demo-results/devnet-stage-pay-rehearsal-v1.{json,md}.
 *   --deal staged-devnet-deal-rehearsal-v3 (v1 and v2 are used up)
 *                 Runs stage-prep / stage-finish on the rehearsal copy of the
 *                 live deal (same flow, its own PDA; v3 holds 5 USDC), so the
 *                 stage moment can be practised without consuming the live deal.
 *   run       Refuses unless the plan matches the fixtures, neither deal PDA
 *             exists on devnet yet, `check` passes, and a `simulate` rehearsal of the
 *             same run passes, then runs both closings on devnet and writes
 *             demo-results/devnet-<runId>.{json,md}, updated after every
 *             transaction so a partial run is still recorded. Refuses to start
 *             if LOCAL_PROGRAM_SO / ESCROW_PROGRAM_SO is set: the rehearsal
 *             must run the bytecode deployed on devnet, not a local build.
 *
 * The closings, both bound to the golden parcel:
 *   held      initialize -> fund -> title hold -> release (must fail on-chain
 *             with DealHeld 6019, balances unchanged) -> refund
 *   released  initialize -> fund -> title, survey, septic approvals -> release
 *
 * Held release error: the spec expects DealHeld (6019), the default. The
 * deployed program checks `state == Funded` before `hold.is_none()` in
 * release, and place_hold sets the state to Held, so on the deployed bytecode
 * a held release fails with InvalidDealState (6009) and 6019 is unreachable.
 * `simulate` shows this. --held-error names the error the run must see.
 *
 * The held deal refunds the buyer before the released deal is funded, so the
 * buyer needs the deal amount once, not twice. The buyer pays every fee and
 * rent; the seller and reviewers only sign and need no SOL.
 *
 * Sending (devnet): each transaction gets a ComputeBudget unit limit sized
 * from a simulation and a unit price from recent prioritization fees on the
 * accounts it writes (75th percentile, capped at 100,000 micro-lamports per
 * unit), a fresh blockhash with its lastValidBlockHeight, rebroadcasts while
 * unconfirmed, and an automatic re-sign and resend on a new blockhash if the
 * old one expires unseen (it can then never land). Each step's record keeps
 * the limit and price it used. `simulate` (LiteSVM) sends the bare
 * instructions, as before.
 *
 * Keys: escrow/.demo-wallets/<role>.json (Solana CLI keypair format, mode
 * 0600, gitignored). Only public keys are printed or recorded.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { BN, BorshCoder, utils, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  MAX_COMPUTE_UNITS,
  USDC_MINT_DEVNET,
  STAGED_DEAL_ID_LABELS,
  stagedDeal,
  stagedDemoChainAccounts,
  stagedLiveDeal,
  stagedPayRehearsalDeal,
  stagedRehearsalDeal,
  stagedRehearsalV2Deal,
  stagedRehearsalV3Deal,
  stagedReleasedDeal,
  computeBudgetInstructions,
  computeUnitLimit,
  maxPriorityFeeLamports,
  priorityFeeMicroLamports,
  sendUntilLanded,
  type Deal,
  type EscrowInstructionSpec,
} from "@groundtruth/shared";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// ---------------------------------------------------------------- constants

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

/**
 * Retries a devnet RPC call through rate limits (HTTP 429) and transient
 * network errors with backoff up to about a minute. The public devnet RPC
 * rate-limits bursts; web3.js's own retry gives up after a few seconds.
 * Resending a signed transaction is safe: it has the same signature.
 */
async function withRpcRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        /429|rate limit|fetch failed|ECONNRESET|ETIMEDOUT|503|502/i.test(
          message,
        );
      if (!transient || attempt >= 8) throw error;
      const wait = Math.min(1000 * 2 ** attempt, 15_000);
      console.log(
        `  (rpc ${what}: ${(message.split("\n")[0] ?? "").slice(
          0,
          80,
        )}; retrying in ${wait / 1000}s)`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
const PROGRAM = new PublicKey(GROUNDTRUTH_PROGRAM_ID);
const MINT = new PublicKey(USDC_MINT_DEVNET);
const PARCEL_KEY = stagedDeal.parcelKey; // ohio:39049:230-000918
const USDC_DECIMALS = 6;
const DEFAULT_AMOUNT = BigInt(stagedDeal.amountBaseUnits); // 25 USDC

/** 8-byte discriminator + DealAccount::INIT_SPACE with 8 reviewers (529). */
const DEAL_ACCOUNT_SPACE = 537;
const TOKEN_ACCOUNT_SPACE = 165;
/** Devnet base fee per signature. */
const FEE_PER_SIGNATURE = 5000n;
/**
 * Signatures in a full run: seller ATA 1; held: init 1, fund 1, hold 2,
 * release 1, refund 1; released: init 1, fund 1, approvals 3 x 2, release 1.
 */
const SIGNATURES_PER_RUN = 16n;
/** Transactions in a full run (seller ATA 1, held 5, released 6). */
const TRANSACTIONS_PER_RUN = 12n;
/**
 * Most a run can pay in priority fees: every transaction at the capped unit
 * price and the full compute ceiling. Real runs pay far less: the limit is
 * sized from a simulation, and devnet's recent fees are usually zero.
 */
const MAX_PRIORITY_FEES_PER_RUN =
  TRANSACTIONS_PER_RUN * maxPriorityFeeLamports();
/** Headroom on top of the computed SOL need. */
const SOL_MARGIN = 10_000_000n; // 0.01 SOL
/** Fixed run ID of the live stage deal's record (both halves share it). */
const STAGE_RUN_ID = "stage-live-v1";
/** Deals the stage modes drive (--deal); the first is the default. */
const STAGE_DEAL_IDS = [
  stagedLiveDeal.id,
  stagedRehearsalDeal.id,
  stagedRehearsalV2Deal.id,
  stagedRehearsalV3Deal.id,
  stagedPayRehearsalDeal.id,
] as const;
/** Each stage deal's record: demo-results/devnet-<run id>.{json,md}. */
const stageRunId = (outcome: Outcome) =>
  outcome === "rehearsal"
    ? "stage-rehearsal-v1"
    : outcome === "rehearsalV2"
    ? "stage-rehearsal-v2"
    : outcome === "rehearsalV3"
    ? "stage-rehearsal-v3"
    : outcome === "payRehearsal"
    ? "stage-pay-rehearsal-v1"
    : STAGE_RUN_ID;
/** Stand-in block time for simulated transactions (2026-11-18T00:00:00Z). */
const SIMULATED_BLOCK_TIME = 1_795_478_400;

/** Circle faucet: 20 USDC per request, one request per address every 2 hours. */
const CIRCLE_FAUCET_USDC_PER_REQUEST = 20n * 10n ** 6n;

const ESCROW_ROOT = join(__dirname, "..");
const WALLET_DIR = join(ESCROW_ROOT, ".demo-wallets");
const RESULTS_DIR = join(ESCROW_ROOT, "demo-results");

const ROLES = ["buyer", "seller", "title", "survey", "septic"] as const;
type Role = (typeof ROLES)[number];
type Wallets = Record<Role, Keypair>;
const REVIEWERS = [
  { role: "title", variant: "Title" },
  { role: "survey", variant: "Survey" },
  { role: "septic", variant: "Septic" },
] as const;

const idl = GROUNDTRUTH_ESCROW_IDL as unknown as Idl;
const coder = new BorshCoder(idl);

// ---------------------------------------------------------------- helpers

const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const explorerAddress = (key: string) =>
  `https://explorer.solana.com/address/${key}?cluster=devnet`;

function formatUsdc(baseUnits: bigint | null): string {
  if (baseUnits === null) return "closed";
  const whole = baseUnits / 10n ** 6n;
  const frac = (baseUnits % 10n ** 6n).toString().padStart(6, "0");
  return `${whole}.${frac.replace(/0{1,4}$/, "")}`;
}

const formatSol = (lamports: bigint) =>
  (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);

function parseUsdc(text: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  if (!match)
    throw new Error(`--amount must be USDC like 25 or 12.5, got ${text}`);
  const amount =
    BigInt(match[1]!) * 10n ** 6n + BigInt((match[2] ?? "").padEnd(6, "0"));
  if (amount <= 0n) throw new Error("--amount must be greater than zero");
  return amount;
}

/** One instruction, accounts in IDL order with the IDL's signer/writable flags. */
function instruction(
  name: string,
  args: Record<string, unknown>,
  accounts: Record<string, PublicKey>,
): TransactionInstruction {
  const def = idl.instructions.find((i) => i.name === name);
  if (!def) throw new Error(`IDL has no instruction ${name}`);
  const keys = def.accounts.map((account) => {
    if ("accounts" in account) throw new Error(`${name}: nested accounts`);
    const pubkey =
      accounts[account.name] ??
      (account.address ? new PublicKey(account.address) : undefined);
    if (!pubkey) throw new Error(`${name}: missing account ${account.name}`);
    return {
      pubkey,
      isSigner: Boolean(account.signer),
      isWritable: Boolean(account.writable),
    };
  });
  const unknown = Object.keys(accounts).filter(
    (key) => !def.accounts.some((a) => a.name === key),
  );
  if (unknown.length) throw new Error(`${name}: unknown accounts ${unknown}`);
  return new TransactionInstruction({
    programId: PROGRAM,
    keys,
    data: coder.instruction.encode(name, args),
  });
}

// ---------------------------------------------------------------- wallets

function assertIgnored(path: string) {
  try {
    execFileSync("git", ["check-ignore", "-q", path], { cwd: ESCROW_ROOT });
  } catch {
    throw new Error(
      `${path} is not gitignored; refusing to write private keys there`,
    );
  }
}

function loadOrCreateWallets(): { wallets: Wallets; created: Role[] } {
  mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
  const created: Role[] = [];
  const entries = ROLES.map((role) => {
    const file = join(WALLET_DIR, `${role}.json`);
    assertIgnored(file);
    if (!existsSync(file)) {
      const keypair = Keypair.generate();
      writeFileSync(file, JSON.stringify(Array.from(keypair.secretKey)), {
        mode: 0o600,
      });
      chmodSync(file, 0o600);
      created.push(role);
      return [role, keypair] as const;
    }
    const secret = Uint8Array.from(JSON.parse(readFileSync(file, "utf8")));
    return [role, Keypair.fromSecretKey(secret)] as const;
  });
  return { wallets: Object.fromEntries(entries) as Wallets, created };
}

// ---------------------------------------------------------------- plan

const OUTCOMES = [
  "held",
  "released",
  "live",
  "rehearsal",
  "rehearsalV2",
  "rehearsalV3",
  "payRehearsal",
] as const;
type Outcome = (typeof OUTCOMES)[number];
const FIXTURES: Record<Outcome, Deal> = {
  held: stagedDeal,
  released: stagedReleasedDeal,
  live: stagedLiveDeal,
  rehearsal: stagedRehearsalDeal,
  rehearsalV2: stagedRehearsalV2Deal,
  rehearsalV3: stagedRehearsalV3Deal,
  payRehearsal: stagedPayRehearsalDeal,
};
/** `run` drives the held and released closings; `stage-*` drives the live one. */
const RUN_OUTCOMES: readonly Outcome[] = ["held", "released"];

interface DealPlan {
  outcome: Outcome;
  fixtureId: string;
  dealIdLabel: string;
  dealId: Buffer;
  dealPda: PublicKey;
  vault: PublicKey;
  buyerTokenAccount: PublicKey;
  sellerTokenAccount: PublicKey;
  /** Base units: --amount for held/released, the fixture's for live. */
  amount: bigint;
}

/** Every address of each deal, derived from the wallets and fixed labels. */
function planDeals(wallets: Wallets, runAmount: bigint): DealPlan[] {
  return OUTCOMES.map((outcome) => {
    const dealIdLabel = STAGED_DEAL_ID_LABELS[outcome];
    const dealId = createHash("sha256").update(dealIdLabel).digest();
    const [dealPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), wallets.buyer.publicKey.toBuffer(), dealId],
      PROGRAM,
    );
    return {
      outcome,
      fixtureId: FIXTURES[outcome].id,
      dealIdLabel,
      dealId,
      dealPda,
      vault: getAssociatedTokenAddressSync(MINT, dealPda, true),
      buyerTokenAccount: getAssociatedTokenAddressSync(
        MINT,
        wallets.buyer.publicKey,
      ),
      sellerTokenAccount: getAssociatedTokenAddressSync(
        MINT,
        wallets.seller.publicKey,
      ),
      amount:
        outcome === "live" ||
        outcome === "rehearsal" ||
        outcome === "rehearsalV2" ||
        outcome === "rehearsalV3" ||
        outcome === "payRehearsal"
          ? BigInt(FIXTURES[outcome].amountBaseUnits)
          : runAmount,
    };
  });
}

/**
 * Differences between the plan and the backend's staged deals. Any
 * difference means the API would skip these deals' events as unknownDeal or
 * reject them as drift.
 */
function fixtureMismatches(wallets: Wallets, plans: DealPlan[]): string[] {
  const out: string[] = [];
  const same = (what: string, fixture: unknown, planned: unknown) => {
    if (fixture !== planned)
      out.push(`${what}: fixture ${fixture}, plan ${planned}`);
  };
  for (const plan of plans) {
    const deal = FIXTURES[plan.outcome];
    const chain = stagedDemoChainAccounts[deal.id];
    const at = `${deal.id}`;
    same(`${at} escrowAddress`, deal.escrowAddress, plan.dealPda.toBase58());
    same(
      `${at} buyerWallet`,
      deal.buyerWallet,
      wallets.buyer.publicKey.toBase58(),
    );
    same(
      `${at} sellerWallet`,
      deal.sellerWallet,
      wallets.seller.publicKey.toBase58(),
    );
    same(
      `${at} sellerTokenAccount`,
      deal.sellerTokenAccount,
      plan.sellerTokenAccount.toBase58(),
    );
    same(`${at} amountBaseUnits`, deal.amountBaseUnits, plan.amount.toString());
    same(`${at} parcelKey`, deal.parcelKey, PARCEL_KEY);
    same(
      `${at} reviewers`,
      JSON.stringify(deal.reviewers),
      JSON.stringify(
        REVIEWERS.map((r) => ({
          wallet: wallets[r.role].publicKey.toBase58(),
          role: r.role,
          required: true,
        })),
      ),
    );
    same(`${at} dealIdLabel`, chain?.dealIdLabel, plan.dealIdLabel);
    same(`${at} dealIdHex`, chain?.dealIdHex, plan.dealId.toString("hex"));
    same(`${at} vault`, chain?.vault, plan.vault.toBase58());
    same(
      `${at} buyerTokenAccount`,
      chain?.buyerTokenAccount,
      plan.buyerTokenAccount.toBase58(),
    );
  }
  return out;
}

function printPlan(wallets: Wallets, plans: DealPlan[]) {
  for (const plan of plans) {
    console.log(`
${plan.outcome} deal (${plan.fixtureId})`);
    console.log(`  amount            ${formatUsdc(plan.amount)} USDC`);
    console.log(`  deal_id label     ${plan.dealIdLabel}`);
    console.log(`  deal_id (hex)     ${plan.dealId.toString("hex")}`);
    console.log(`  deal PDA          ${plan.dealPda.toBase58()}`);
    console.log(`  vault             ${plan.vault.toBase58()}`);
    console.log(`  buyer             ${wallets.buyer.publicKey.toBase58()}`);
    console.log(`  buyer USDC        ${plan.buyerTokenAccount.toBase58()}`);
    console.log(`  seller            ${wallets.seller.publicKey.toBase58()}`);
    console.log(`  seller USDC       ${plan.sellerTokenAccount.toBase58()}`);
    for (const r of REVIEWERS) {
      console.log(
        `  ${`${r.role} reviewer`.padEnd(17)} ${wallets[
          r.role
        ].publicKey.toBase58()} (required)`,
      );
    }
  }
}

/** Deal PDAs that already exist on devnet, with their state. */
async function existingDeals(chain: Chain, plans: DealPlan[]) {
  const found: string[] = [];
  for (const plan of plans) {
    if (await chain.account(plan.dealPda)) {
      const view = await readDeal(chain, plan.dealPda);
      const failed = (await chain.failedReleases?.(plan.dealPda)) ?? [];
      found.push(
        `${
          plan.outcome
        } deal ${plan.dealPda.toBase58()} already exists (state ${
          view.state
        }, approvals ${JSON.stringify(view.approvals)}, failed transactions ${
          failed.length
        })`,
      );
    }
  }
  return found;
}

// ---------------------------------------------------------------- chains

interface Sent {
  signature: string;
  slot: number | null;
  /** RPC-shaped error, e.g. { InstructionError: [2, { Custom: 6019 }] }. */
  err: unknown;
  logs: string[];
  /**
   * Instructions prepended before the caller's (devnet: the two ComputeBudget
   * ones), so the caller's instruction i is the transaction's i + offset.
   */
  instructionOffset: number;
  /** Devnet only: what the transaction asked for and paid per unit. */
  computeBudget?: { units: number; microLamports: number };
  /** Devnet only: fresh-blockhash attempts it took (1 = first try). */
  attempts?: number;
}

interface AccountView {
  data: Buffer;
  owner: PublicKey;
  lamports: bigint;
}

interface HistoryEntry {
  signature: string;
  slot: number;
  err: unknown;
  logs: string[];
  /** The top-level GroundTruth instruction, decoded with the IDL. */
  instruction: { name: string; data: Record<string, unknown> } | null;
}

interface Chain {
  kind: "devnet" | "simulation";
  send(
    ixs: TransactionInstruction[],
    feePayer: Keypair,
    signers: Keypair[],
    opts?: { expectFailure?: boolean },
  ): Promise<Sent>;
  account(key: PublicKey): Promise<AccountView | null>;
  /** Devnet only: signatures of failed transactions that touched `key`. */
  failedReleases?(key: PublicKey): Promise<string[]>;
  /** Devnet only: every confirmed transaction that touched `key`, oldest first. */
  history?(key: PublicKey): Promise<HistoryEntry[]>;
  /** Devnet only: which of `signatures` are confirmed or finalized on chain. */
  confirmed?(signatures: string[]): Promise<Set<string>>;
  rent(space: number): Promise<bigint>;
}

async function signedTx(
  ixs: TransactionInstruction[],
  feePayer: Keypair,
  signers: Keypair[],
  blockhash: string,
) {
  const tx = new Transaction({
    feePayer: feePayer.publicKey,
    recentBlockhash: blockhash,
  });
  tx.add(...ixs);
  const unique = [feePayer, ...signers].filter(
    (k, i, all) => all.findIndex((o) => o.publicKey.equals(k.publicKey)) === i,
  );
  tx.sign(...unique);
  return tx;
}

/** ComputeBudget limit and price instructions (from @groundtruth/shared). */
function budgetInstructions(budget: {
  units: number;
  microLamports: number;
}): TransactionInstruction[] {
  return computeBudgetInstructions(budget).map(
    (spec: EscrowInstructionSpec) =>
      new TransactionInstruction({
        programId: new PublicKey(spec.programId),
        keys: [],
        data: Buffer.from(spec.data),
      }),
  );
}

/**
 * Devnet: every transaction carries a ComputeBudget unit limit (simulated
 * units plus margin) and a unit price from recent prioritization fees
 * (capped), is signed on a fresh blockhash with its lastValidBlockHeight,
 * and is rebroadcast while unconfirmed. If that blockhash expires with the
 * transaction unseen, it can never land, so it is rebuilt, re-signed, and
 * resent (up to 3 attempts). See sendUntilLanded in @groundtruth/shared.
 */
function devnetChain(): Chain & { connection: Connection } {
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
  return {
    kind: "devnet",
    connection,
    async send(ixs, feePayer, signers, opts = {}) {
      // Accounts the transaction writes, whose recent fees set its price.
      const writable = [
        ...new Set(
          ixs.flatMap((ix) =>
            ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey.toBase58()),
          ),
        ),
      ]
        .slice(0, 128)
        .map((key) => new PublicKey(key));
      let budget = { units: MAX_COMPUTE_UNITS, microLamports: 0 };
      const landed = await sendUntilLanded({
        // A fresh blockhash, fee read, and simulation every attempt.
        async prepare() {
          const fees = await withRpcRetry("getRecentPrioritizationFees", () =>
            connection.getRecentPrioritizationFees({
              lockedWritableAccounts: writable,
            }),
          ).catch(() => []);
          const microLamports = priorityFeeMicroLamports(fees);
          const latest = await withRpcRetry("getLatestBlockhash", () =>
            connection.getLatestBlockhash("confirmed"),
          );
          const build = (units: number) =>
            signedTx(
              [...budgetInstructions({ units, microLamports }), ...ixs],
              feePayer,
              signers,
              latest.blockhash,
            );
          // Simulated at the ceiling to size the limit. A transaction
          // expected to fail still reports the units it used.
          const simulation = await withRpcRetry("simulateTransaction", () =>
            build(MAX_COMPUTE_UNITS).then((tx) =>
              connection.simulateTransaction(tx),
            ),
          ).catch(() => null);
          budget = {
            units: computeUnitLimit(simulation?.value.unitsConsumed),
            microLamports,
          };
          const tx = await build(budget.units);
          return {
            signature: utils.bytes.bs58.encode(tx.signature!),
            serialized: tx.serialize(),
            lastValidBlockHeight: latest.lastValidBlockHeight,
          };
        },
        // A transaction expected to fail skips preflight, so the program's
        // rejection is recorded on chain instead of only in a simulation.
        // Rebroadcasts of the same bytes skip it too, and don't back off.
        broadcast: async (bytes, first) => {
          const send = () =>
            connection.sendRawTransaction(bytes, {
              skipPreflight: Boolean(opts.expectFailure) || !first,
              preflightCommitment: "confirmed",
              maxRetries: 0,
            });
          await (first ? withRpcRetry("sendRawTransaction", send) : send());
        },
        // Poll the status ourselves: web3's confirmTransaction makes
        // background RPC calls whose rate-limit errors escape any retry.
        status: async (signature, deep) => {
          const { value } = await withRpcRetry("getSignatureStatuses", () =>
            connection.getSignatureStatuses([signature], {
              searchTransactionHistory: deep,
            }),
          );
          const status = value[0];
          return status
            ? {
                confirmationStatus: status.confirmationStatus ?? "processed",
                err: status.err,
              }
            : null;
        },
        blockHeight: () =>
          withRpcRetry("getBlockHeight", () =>
            connection.getBlockHeight("confirmed"),
          ),
        onEvent(event) {
          if (event.kind === "expired") {
            console.log(
              `  (blockhash expired before devnet saw ${event.signature}; it can never land. Resending on a fresh blockhash: attempt ${event.next} of ${event.of})`,
            );
          }
        },
      });
      const { signature } = landed;
      for (let attempt = 0; attempt < 20; attempt++) {
        const got = await withRpcRetry("getTransaction", () =>
          connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          }),
        );
        if (got?.meta) {
          return {
            signature,
            slot: got.slot,
            err: got.meta.err,
            logs: got.meta.logMessages ?? [],
            instructionOffset: 2,
            computeBudget: budget,
            attempts: landed.attempts,
          };
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error(`${signature} confirmed but not readable yet`);
    },
    async account(key) {
      const info = await withRpcRetry("getAccountInfo", () =>
        connection.getAccountInfo(key, "confirmed"),
      );
      return info
        ? {
            data: info.data,
            owner: info.owner,
            lamports: BigInt(info.lamports),
          }
        : null;
    },
    async rent(space) {
      return BigInt(
        await withRpcRetry("getMinimumBalanceForRentExemption", () =>
          connection.getMinimumBalanceForRentExemption(space),
        ),
      );
    },
    async failedReleases(key) {
      const sigs = await withRpcRetry("getSignaturesForAddress", () =>
        connection.getSignaturesForAddress(key, { limit: 1000 }, "confirmed"),
      );
      return sigs.filter((s) => s.err !== null).map((s) => s.signature);
    },
    async history(key) {
      const sigs = await withRpcRetry("getSignaturesForAddress", () =>
        connection.getSignaturesForAddress(key, { limit: 1000 }, "confirmed"),
      );
      const out: HistoryEntry[] = [];
      for (const { signature } of [...sigs].reverse()) {
        const tx = await withRpcRetry("getTransaction", () =>
          connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          }),
        );
        if (!tx?.meta) continue;
        const message = tx.transaction.message;
        const keys = message.staticAccountKeys;
        const ix = message.compiledInstructions.find((c) =>
          keys[c.programIdIndex]?.equals(PROGRAM),
        );
        const decoded = ix
          ? coder.instruction.decode(Buffer.from(ix.data))
          : null;
        out.push({
          signature,
          slot: tx.slot,
          err: tx.meta.err,
          logs: tx.meta.logMessages ?? [],
          instruction: decoded
            ? {
                name: decoded.name,
                data: decoded.data as Record<string, unknown>,
              }
            : null,
        });
      }
      return out;
    },
    async confirmed(signatures) {
      const out = new Set<string>();
      for (let i = 0; i < signatures.length; i += 200) {
        const batch = signatures.slice(i, i + 200);
        const { value } = await withRpcRetry("getSignatureStatuses", () =>
          connection.getSignatureStatuses(batch, {
            searchTransactionHistory: true,
          }),
        );
        value.forEach((v, j) => {
          if (v && v.confirmationStatus !== "processed") out.add(batch[j]!);
        });
      }
      return out;
    },
  };
}

/** A local program build to simulate instead of the deployed program, if configured. */
function localProgramPath(): string | undefined {
  return (
    process.env.LOCAL_PROGRAM_SO || process.env.ESCROW_PROGRAM_SO || undefined
  );
}

/** The deployed program's ELF: ProgramData account data after its 45-byte header, or local build if specified. */
async function deployedProgramBytes(connection: Connection) {
  const rawPath = localProgramPath();
  if (rawPath) {
    const resolvedPath = existsSync(rawPath)
      ? rawPath
      : existsSync(join(ESCROW_ROOT, rawPath))
      ? join(ESCROW_ROOT, rawPath)
      : null;
    if (!resolvedPath) {
      throw new Error(
        `Configured local program file not found at "${rawPath}" or "${join(
          ESCROW_ROOT,
          rawPath,
        )}". Build the program with "anchor build" or verify LOCAL_PROGRAM_SO/ESCROW_PROGRAM_SO.`,
      );
    }
    try {
      const elf = readFileSync(resolvedPath);
      return {
        programData: "local-target-build",
        deploySlot: 0,
        sha256: createHash("sha256").update(elf).digest("hex"),
        elf,
      };
    } catch (err) {
      throw new Error(
        `Failed to read configured local program file at "${resolvedPath}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const program = await withRpcRetry("getAccountInfo", () =>
    connection.getAccountInfo(PROGRAM, "confirmed"),
  );
  if (!program?.executable) throw new Error("program not found on devnet");
  const programData = new PublicKey(program.data.subarray(4, 36));
  const data = await withRpcRetry("getAccountInfo", () =>
    connection.getAccountInfo(programData, "confirmed"),
  );
  if (!data) throw new Error("ProgramData account not found");
  const elf = data.data.subarray(45);
  return {
    programData: programData.toBase58(),
    deploySlot: Number(data.data.readBigUInt64LE(4)),
    sha256: createHash("sha256").update(elf).digest("hex"),
    elf,
  };
}

async function simulationChain(wallets: Wallets, usdc: bigint) {
  const { LiteSVM, FailedTransactionMetadata } = await import("litesvm");
  const { address, getTransactionDecoder, lamports } = await import(
    "@solana/kit"
  );
  const deployed = await deployedProgramBytes(
    new Connection(RPC_URL, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
    }),
  );

  const svm = new LiteSVM();
  svm.addProgram(address(PROGRAM.toBase58()), deployed.elf);

  // Stand-in for Circle's mint at the same address, with a local authority,
  // so the simulated buyer can hold test USDC. Simulation only.
  const mintAuthority = Keypair.generate();
  const mintData = Buffer.alloc(82);
  mintData.writeUInt32LE(1, 0);
  mintAuthority.publicKey.toBuffer().copy(mintData, 4);
  mintData.writeBigUInt64LE(usdc, 36);
  mintData.writeUInt8(USDC_DECIMALS, 44);
  mintData.writeUInt8(1, 45);
  svm.setAccount({
    address: address(MINT.toBase58()),
    data: mintData,
    executable: false,
    lamports: lamports(svm.minimumBalanceForRentExemption(82n)),
    programAddress: address(TOKEN_PROGRAM_ID.toBase58()),
    space: 82n,
  });
  svm.airdrop(
    address(wallets.buyer.publicKey.toBase58()),
    lamports(BigInt(LAMPORTS_PER_SOL)),
  );
  svm.airdrop(
    address(mintAuthority.publicKey.toBase58()),
    lamports(BigInt(LAMPORTS_PER_SOL)),
  );

  const decoder = getTransactionDecoder();
  // Every simulated transaction in getTransaction's jsonParsed shape, for
  // backend replay tests. Slots and block times are local stand-ins.
  const recorded: unknown[] = [];
  let slot = 0;
  const chain: Chain = {
    kind: "simulation",
    async send(ixs, feePayer, signers) {
      const tx = await signedTx(ixs, feePayer, signers, svm.latestBlockhash());
      const result = svm.sendTransaction(decoder.decode(tx.serialize()));
      svm.expireBlockhash();
      const meta =
        result instanceof FailedTransactionMetadata ? result.meta() : result;
      let err: unknown = null;
      if (result instanceof FailedTransactionMetadata) {
        const e = result.err() as unknown as {
          index?: number;
          err?: () => { code?: number; toString(): string };
          toString(): string;
        };
        if (typeof e.index === "number" && e.err) {
          const inner = e.err();
          err = {
            InstructionError: [
              e.index,
              typeof inner.code === "number"
                ? { Custom: inner.code }
                : inner.toString(),
            ],
          };
        } else {
          err = e.toString();
        }
      }
      const signature = utils.bytes.bs58.encode(meta.signature());
      const message = tx.compileMessage();
      const keys = message.accountKeys.map((k) => k.toBase58());
      slot += 1;
      recorded.push({
        slot,
        blockTime: SIMULATED_BLOCK_TIME + slot,
        version: "legacy",
        transaction: {
          signatures: [signature],
          message: {
            accountKeys: keys.map((pubkey, i) => ({
              pubkey,
              signer: message.isAccountSigner(i),
              writable: message.isAccountWritable(i),
              source: "transaction",
            })),
            recentBlockhash: message.recentBlockhash,
            instructions: message.instructions.map((ix) => ({
              programId: keys[ix.programIdIndex],
              accounts: ix.accounts.map((i) => keys[i]),
              data: ix.data,
              stackHeight: null,
            })),
          },
        },
        meta: {
          err,
          status: err === null ? { Ok: null } : { Err: err },
          fee: 5000 * message.header.numRequiredSignatures,
          logMessages: meta.logs(),
          innerInstructions: meta
            .innerInstructions()
            .map((group, index) => ({
              index,
              instructions: group.map((inner) => {
                const compiled = inner.instruction();
                return {
                  programId: keys[compiled.programIdIndex()],
                  accounts: Array.from(compiled.accounts()).map((i) => keys[i]),
                  data: utils.bytes.bs58.encode(compiled.data()),
                  stackHeight: inner.stackHeight(),
                };
              }),
            }))
            .filter((group) => group.instructions.length > 0),
        },
      });
      // No ComputeBudget instructions here: the simulation records feed the
      // backend's replay fixtures, which match the original recorded runs.
      return { signature, slot, err, logs: meta.logs(), instructionOffset: 0 };
    },
    async account(key) {
      const acct = svm.getAccount(address(key.toBase58()));
      if (!acct.exists) return null;
      return {
        data: Buffer.from(acct.data),
        owner: new PublicKey(acct.programAddress),
        lamports: BigInt(acct.lamports),
      };
    },
    async rent(space) {
      return svm.minimumBalanceForRentExemption(BigInt(space));
    },
  };

  // Simulated faucet: the buyer's ATA with `usdc` test USDC.
  const buyerAta = getAssociatedTokenAddressSync(MINT, wallets.buyer.publicKey);
  const faucet = await chain.send(
    [
      createAssociatedTokenAccountIdempotentInstruction(
        mintAuthority.publicKey,
        buyerAta,
        wallets.buyer.publicKey,
        MINT,
      ),
      createMintToInstruction(MINT, buyerAta, mintAuthority.publicKey, usdc),
    ],
    mintAuthority,
    [],
  );
  if (faucet.err)
    throw new Error(`simulated faucet failed: ${JSON.stringify(faucet.err)}`);
  return { chain, deployed, recorded };
}

// ---------------------------------------------------------------- reads

/** Token balance in base units, or null when the account does not exist. */
async function tokenBalance(
  chain: Chain,
  key: PublicKey,
): Promise<bigint | null> {
  const acct = await chain.account(key);
  if (!acct) return null;
  if (!acct.owner.equals(TOKEN_PROGRAM_ID))
    throw new Error(`${key} is not a token account`);
  return acct.data.readBigUInt64LE(64);
}

interface DealView {
  state: string;
  hold: boolean;
  approvals: Record<string, boolean>;
  amount: bigint;
}

async function readDeal(chain: Chain, pda: PublicKey): Promise<DealView> {
  const acct = await chain.account(pda);
  if (!acct) throw new Error(`deal ${pda} does not exist`);
  if (acct.data.length !== DEAL_ACCOUNT_SPACE) {
    throw new Error(
      `deal account is ${acct.data.length} bytes, expected ${DEAL_ACCOUNT_SPACE}`,
    );
  }
  const deal = coder.accounts.decode("DealAccount", acct.data) as {
    state: Record<string, unknown>;
    hold: unknown;
    amount: { toString(): string };
    reviewers: { role: Record<string, unknown>; approved: boolean }[];
  };
  return {
    state: Object.keys(deal.state)[0]!.toLowerCase(),
    hold: deal.hold !== null,
    amount: BigInt(deal.amount.toString()),
    approvals: Object.fromEntries(
      deal.reviewers.map((r) => [
        Object.keys(r.role)[0]!.toLowerCase(),
        r.approved,
      ]),
    ),
  };
}

// ---------------------------------------------------------------- funding

interface FundingCheck {
  ok: boolean;
  buyerSol: bigint;
  buyerUsdc: bigint | null;
  needSol: bigint;
  needUsdc: bigint;
  sellerAtaExists: boolean;
}

async function checkFunding(
  chain: Chain,
  wallets: Wallets,
  amount: bigint,
  /** USDC that returns to the buyer before it is needed (a resumed refund). */
  credit = 0n,
): Promise<FundingCheck> {
  const buyer = wallets.buyer.publicKey;
  const sellerAta = getAssociatedTokenAddressSync(
    MINT,
    wallets.seller.publicKey,
  );
  // One at a time: the public devnet RPC rate-limits bursts.
  const buyerAcct = await chain.account(buyer);
  const buyerUsdc = await tokenBalance(
    chain,
    getAssociatedTokenAddressSync(MINT, buyer),
  );
  const sellerAta_ = await chain.account(sellerAta);
  const dealRent = await chain.rent(DEAL_ACCOUNT_SPACE);
  const tokenRent = await chain.rent(TOKEN_ACCOUNT_SPACE);
  // Two deal accounts stay open (terminal deals are not closed). Each vault
  // is refunded when its deal settles; count both to be safe. Plus the
  // seller's USDC account if it does not exist yet, and every fee.
  const needSol =
    2n * dealRent +
    2n * tokenRent +
    (sellerAta_ ? 0n : tokenRent) +
    SIGNATURES_PER_RUN * FEE_PER_SIGNATURE +
    MAX_PRIORITY_FEES_PER_RUN +
    SOL_MARGIN;
  const buyerSol = buyerAcct?.lamports ?? 0n;
  return {
    ok: buyerSol >= needSol && (buyerUsdc ?? 0n) + credit >= amount,
    buyerSol,
    buyerUsdc,
    needSol,
    // What must already be in the buyer's account now.
    needUsdc: amount > credit ? amount - credit : 0n,
    sellerAtaExists: Boolean(sellerAta_),
  };
}

function printFunding(wallets: Wallets, f: FundingCheck) {
  const buyer = wallets.buyer.publicKey.toBase58();
  const usdcHave = f.buyerUsdc ?? 0n;
  console.log(`\nBuyer balances on devnet (${buyer}):`);
  console.log(
    `  SOL : ${formatSol(f.buyerSol)} (needs >= ${formatSol(f.needSol)})`,
  );
  console.log(
    `  USDC: ${
      f.buyerUsdc === null ? "no USDC account yet" : formatUsdc(usdcHave)
    } (needs >= ${formatUsdc(f.needUsdc)})`,
  );
  if (f.ok) {
    console.log("\nFunded. `demo:deals run` can send the devnet transactions.");
    return;
  }
  console.log("\nNOT FUNDED. Fund the buyer, then run `check` again:");
  if (f.buyerSol < f.needSol) {
    console.log(
      `  - SOL : https://faucet.solana.com  network Devnet, address ${buyer}, at least ${formatSol(
        f.needSol - f.buyerSol,
      )} SOL more (1 SOL is plenty).`,
    );
  }
  if (usdcHave < f.needUsdc) {
    const missing = f.needUsdc - usdcHave;
    const requests =
      (missing + CIRCLE_FAUCET_USDC_PER_REQUEST - 1n) /
      CIRCLE_FAUCET_USDC_PER_REQUEST;
    console.log(
      `  - USDC: https://faucet.circle.com  network Solana Devnet, address ${buyer}, at least ${formatUsdc(
        missing,
      )} USDC more.`,
    );
    console.log(
      `          Circle gives ${formatUsdc(
        CIRCLE_FAUCET_USDC_PER_REQUEST,
      )} USDC per request, once every 2 hours per address: that is ${requests} request(s)` +
        (requests > 1n ? `, at least 2 hours apart.` : "."),
    );
    if (requests > 1n) {
      console.log(
        `          One request covers --amount ${formatUsdc(
          CIRCLE_FAUCET_USDC_PER_REQUEST,
        )} or less. The staged fixture amount is ${formatUsdc(
          DEFAULT_AMOUNT,
        )} USDC; the API rejects chain events whose amount differs from the seeded deal, so a smaller amount also needs fixtures.ts changed to match.`,
      );
    }
  }
  console.log(
    "  The seller and reviewers need nothing: the buyer pays every fee.",
  );
}

// ---------------------------------------------------------------- results

interface Step {
  step: string;
  signer: string;
  signature: string;
  slot: number | null;
  ok: boolean;
  err?: unknown;
  programError?: string;
  stateAfter: string;
  /** Sent by an earlier, interrupted run; recovered from chain history. */
  recovered?: boolean;
  /** Devnet: the ComputeBudget unit limit and price (micro-lamports per unit). */
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
  /** Devnet: fresh-blockhash attempts it took, when more than one. */
  attempts?: number;
}

interface Balances {
  moment: string;
  buyerUsdc: string;
  vaultUsdc: string | null;
  sellerUsdc: string;
}

interface DealResult {
  label: Outcome;
  fixtureId: string;
  dealIdLabel: string;
  dealIdHex: string;
  dealPda: string;
  vault: string;
  steps: Step[];
  balances: Balances[];
  finalState?: string;
}

interface Results {
  note: string;
  mode: "devnet" | "simulation";
  status: "running" | "complete" | "failed";
  error?: string;
  cluster: "devnet";
  rpc: string;
  programId: string;
  mint: string;
  parcelKey: string;
  amountBaseUnits: string;
  expectedHeldReleaseError: string;
  runId: string;
  startedAt: string;
  resumedFrom?: {
    file: string;
    runId: string;
    keptSignatures: number;
    droppedSignatures: number;
  };
  finishedAt?: string;
  simulatedProgram?: {
    programData: string;
    deploySlot: number;
    sha256: string;
  };
  wallets: Record<string, string>;
  setup: Step[];
  deals: DealResult[];
}

function resultPaths(results: Results) {
  // simulation.* is gitignored; the stage rehearsal gets its own file.
  const base =
    results.mode === "devnet"
      ? `devnet-${results.runId}`
      : results.runId.startsWith("stage-")
      ? "simulation.stage"
      : "simulation";
  return {
    json: join(RESULTS_DIR, `${base}.json`),
    md: join(RESULTS_DIR, `${base}.md`),
  };
}

function writeResults(results: Results) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const paths = resultPaths(results);
  writeFileSync(paths.json, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(paths.md, proofMarkdown(results));
  return paths;
}

function proofMarkdown(r: Results): string {
  const onChain = r.mode === "devnet";
  const sig = (s: string) =>
    onChain
      ? `[\`${s.slice(0, 8)}…${s.slice(-4)}\`](${explorerTx(s)})`
      : `\`${s.slice(0, 8)}…\``;
  const addr = (a: string) =>
    onChain ? `[\`${a}\`](${explorerAddress(a)})` : `\`${a}\``;
  const lines = [
    onChain
      ? `# GroundTruth demo closings on Solana devnet`
      : `# GroundTruth demo closings: LOCAL SIMULATION (not on chain)`,
    "",
    onChain
      ? "Staged test closings with devnet test USDC. Every signature links to Solana Explorer (devnet)."
      : "LiteSVM run of the deployed program's bytecode with a stand-in USDC mint. Nothing here exists on devnet; signatures are local.",
    "",
    `| | |`,
    `| --- | --- |`,
    `| Status | ${r.status}${r.error ? `: ${r.error}` : ""} |`,
    `| Program | ${addr(r.programId)} |`,
    `| USDC mint | ${addr(r.mint)}${
      onChain ? " (Circle devnet)" : " (local stand-in)"
    } |`,
    `| Parcel | \`${r.parcelKey}\` |`,
    `| Amount per deal | ${formatUsdc(
      BigInt(r.amountBaseUnits),
    )} test USDC (\`${r.amountBaseUnits}\` base units) |`,
    `| Run | \`${r.runId}\`, ${r.startedAt}${
      r.finishedAt ? ` → ${r.finishedAt}` : ""
    } |`,
    ...(r.resumedFrom
      ? [
          `| Resumed from | \`${r.resumedFrom.runId}\` (kept ${r.resumedFrom.keptSignatures} devnet signatures, dropped ${r.resumedFrom.droppedSignatures} not on devnet) |`,
        ]
      : []),
    ...(r.simulatedProgram
      ? [
          `| Program bytes | ProgramData \`${
            r.simulatedProgram.programData
          }\`, deploy slot ${
            r.simulatedProgram.deploySlot
          }, sha256 \`${r.simulatedProgram.sha256.slice(0, 16)}…\` |`,
        ]
      : []),
    "",
    "## Wallets (staged, public keys only)",
    "",
    "| Role | Address |",
    "| --- | --- |",
    ...Object.entries(r.wallets).map(
      ([role, key]) => `| ${role} | ${addr(key)} |`,
    ),
  ];
  if (r.setup.length) {
    lines.push(
      "",
      "## Setup",
      "",
      "| Step | Signer | Signature |",
      "| --- | --- | --- |",
    );
    for (const s of r.setup)
      lines.push(`| ${s.step} | ${s.signer} | ${sig(s.signature)} |`);
  }
  for (const deal of r.deals) {
    lines.push(
      "",
      `## ${
        deal.label === "held"
          ? "Held deal: release rejected, buyer refunded"
          : deal.label === "payRehearsal"
          ? "Solana Pay rehearsal deal: initialized here, funded by the buyer's wallet"
          : "Released deal: seller paid after every approval"
      }`,
      "",
      `- Deal PDA: ${addr(deal.dealPda)}`,
      `- Vault: ${addr(deal.vault)}`,
      `- Backend deal: \`${deal.fixtureId}\``,
      `- Deal ID: \`${deal.dealIdHex}\` = sha256(\`${deal.dealIdLabel}\`)`,
      ...(deal.finalState ? [`- Final state: **${deal.finalState}**`] : []),
      "",
      "| Step | Signer | Result | State after | Signature |",
      "| --- | --- | --- | --- | --- |",
      ...deal.steps.map(
        (s) =>
          `| ${s.step}${s.recovered ? " (recovered from chain)" : ""} | ${
            s.signer
          } | ${
            s.ok
              ? "ok"
              : `**failed on-chain: ${
                  s.programError ?? JSON.stringify(s.err)
                }**`
          } | ${s.stateAfter} | ${sig(s.signature)} |`,
      ),
      "",
      "| Balances (USDC) | Buyer | Vault | Seller |",
      "| --- | --- | --- | --- |",
      ...deal.balances.map(
        (b) =>
          `| ${b.moment} | ${formatUsdc(BigInt(b.buyerUsdc))} | ${
            b.vaultUsdc === null ? "closed" : formatUsdc(BigInt(b.vaultUsdc))
          } | ${formatUsdc(BigInt(b.sellerUsdc))} |`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- the flow

const ANCHOR_ERROR = /Error Code: (\w+)\. Error Number: (\d+)\./;

interface ProgramError {
  name: string;
  code: number;
}

/** A program error by IDL name, e.g. DealHeld -> 6019. */
function programError(name: string): ProgramError {
  const found = idl.errors?.find((e) => e.name === name);
  if (!found) throw new Error(`the IDL has no error named ${name}`);
  return { name: found.name, code: found.code };
}

/** Sends one transaction (buyer pays fees), records it, and logs a line. */
function makeSend(chain: Chain, buyer: Keypair, save: () => void) {
  return async (
    target: Step[],
    step: string,
    signer: string,
    ixs: TransactionInstruction[],
    signers: Keypair[],
    stateOf: () => Promise<string>,
    expectFailure = false,
  ) => {
    const sent = await chain.send(ixs, buyer, signers, { expectFailure });
    const errorLine = sent.logs.map((l) => ANCHOR_ERROR.exec(l)).find(Boolean);
    const entry: Step = {
      step,
      signer,
      signature: sent.signature,
      slot: sent.slot,
      ok: sent.err === null,
      ...(sent.err !== null && { err: sent.err }),
      ...(errorLine && { programError: `${errorLine[1]} (${errorLine[2]})` }),
      ...(sent.computeBudget && {
        computeUnitLimit: sent.computeBudget.units,
        computeUnitPriceMicroLamports: sent.computeBudget.microLamports,
      }),
      ...(sent.attempts && sent.attempts > 1 && { attempts: sent.attempts }),
      stateAfter: await stateOf(),
    };
    target.push(entry);
    save();
    console.log(
      `  ${entry.ok ? "ok    " : "FAILED"} ${step.padEnd(
        22,
      )} ${entry.stateAfter.padEnd(9)} ${sent.signature}`,
    );
    if (!expectFailure && !entry.ok) {
      throw new Error(
        `${step} failed: ${JSON.stringify(sent.err)}\n${sent.logs.join("\n")}`,
      );
    }
    return { entry, sent };
  };
}

/** Records buyer, vault, and seller USDC (null vault = closed) on a deal. */
function makeSnapshot(
  chain: Chain,
  deal: DealResult,
  accounts: { buyerAta: PublicKey; vault: PublicKey; sellerAta: PublicKey },
  save: () => void,
) {
  return async (moment: string) => {
    // One at a time: the public devnet RPC rate-limits bursts.
    const b = await tokenBalance(chain, accounts.buyerAta);
    const v = await tokenBalance(chain, accounts.vault);
    const s = await tokenBalance(chain, accounts.sellerAta);
    const entry: Balances = {
      moment,
      buyerUsdc: String(b ?? 0n),
      vaultUsdc: v === null ? null : String(v),
      sellerUsdc: String(s ?? 0n),
    };
    deal.balances.push(entry);
    save();
    return { buyer: b ?? 0n, vault: v, seller: s ?? 0n };
  };
}

async function runClosings(
  chain: Chain,
  wallets: Wallets,
  plans: DealPlan[],
  amount: bigint,
  heldError: ProgramError,
  results: Results,
  resume = false,
) {
  const buyer = wallets.buyer;
  const buyerAta = getAssociatedTokenAddressSync(MINT, buyer.publicKey);
  const sellerAta = getAssociatedTokenAddressSync(
    MINT,
    wallets.seller.publicKey,
  );
  const save = () => writeResults(results);

  const send = makeSend(chain, buyer, save);

  // Setup: the seller's USDC account must exist for release to pay into it.
  if (!(await chain.account(sellerAta))) {
    await send(
      results.setup,
      "create seller USDC account",
      "buyer (fee payer)",
      [
        createAssociatedTokenAccountIdempotentInstruction(
          buyer.publicKey,
          sellerAta,
          wallets.seller.publicKey,
          MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      ],
      [],
      async () => "-",
    );
  }

  for (const plan of plans.filter((p) => RUN_OUTCOMES.includes(p.outcome))) {
    const { outcome: label, dealId, dealPda, vault } = plan;
    // A resumed run continues the deal's record from the previous run.
    const prior = results.deals.find((d) => d.dealPda === dealPda.toBase58());
    const deal: DealResult = prior ?? {
      label,
      fixtureId: plan.fixtureId,
      dealIdLabel: plan.dealIdLabel,
      dealIdHex: dealId.toString("hex"),
      dealPda: dealPda.toBase58(),
      vault: vault.toBase58(),
      steps: [],
      balances: [],
    };
    if (!prior) results.deals.push(deal);
    console.log(`\n${label} deal ${dealPda.toBase58()}`);
    // On-chain state decides which steps a resumed run still has to send.
    const onChain = async () =>
      resume && (await chain.account(dealPda))
        ? readDeal(chain, dealPda)
        : null;
    const skip = (step: string, why: string) =>
      console.log(`  skip   ${step.padEnd(22)} ${why}`);
    // A transaction an interrupted run sent but did not record (it crashed
    // while confirming) is recovered from the deal's on-chain history.
    if (resume && chain.history) {
      const known = new Set(deal.steps.map((st) => st.signature));
      for (const h of await chain.history(dealPda)) {
        if (known.has(h.signature)) continue;
        const name = h.instruction?.name ?? "unknown instruction";
        const role = h.instruction?.data.role
          ? Object.keys(h.instruction.data.role as object)[0]!.toLowerCase()
          : null;
        const errorLine = h.logs.map((l) => ANCHOR_ERROR.exec(l)).find(Boolean);
        const step =
          name === "release" && label === "held"
            ? "release (held)"
            : role
            ? `${name} (${role})`
            : name;
        deal.steps.push({
          step,
          signer:
            role !== null
              ? `${role} reviewer`
              : name === "release"
              ? "buyer (fee payer)"
              : "buyer",
          signature: h.signature,
          slot: h.slot,
          ok: h.err === null,
          ...(h.err !== null && { err: h.err }),
          ...(errorLine && {
            programError: `${errorLine[1]} (${errorLine[2]})`,
          }),
          stateAfter: "-",
          recovered: true,
        });
        console.log(
          `  found  ${step.padEnd(22)} recovered from chain ${h.signature}`,
        );
      }
      deal.steps.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      save();
    }

    const state = async () => (await readDeal(chain, dealPda)).state;
    const snapshot = makeSnapshot(
      chain,
      deal,
      { buyerAta, vault, sellerAta },
      save,
    );
    const expect = (cond: boolean, what: string) => {
      if (!cond) throw new Error(`${label} deal: ${what}`);
    };
    const dealAccounts = { deal: dealPda, vault, mint: MINT };

    const existing = await onChain();
    if (existing) {
      skip("initialize_deal", `already on chain (${existing.state})`);
    } else
      await send(
        deal.steps,
        "initialize_deal",
        "buyer",
        [
          instruction(
            "initialize_deal",
            {
              deal_id: Array.from(dealId),
              amount: new BN(amount.toString()),
              reviewers: REVIEWERS.map((r) => ({
                wallet: wallets[r.role].publicKey,
                role: { [r.variant]: {} },
                required: true,
              })),
            },
            {
              buyer: buyer.publicKey,
              ...dealAccounts,
              seller: wallets.seller.publicKey,
              seller_token_account: sellerAta,
            },
          ),
        ],
        [],
        state,
      );
    const initialized = await readDeal(chain, dealPda);
    expect(initialized.amount === amount, "deal amount differs from --amount");
    expect(
      resume || initialized.state === "draft",
      "initialize did not leave the deal in draft",
    );

    if (initialized.state !== "draft") {
      skip("fund", `already funded (${initialized.state})`);
    } else {
      await send(
        deal.steps,
        "fund",
        "buyer",
        [
          instruction(
            "fund",
            {},
            {
              buyer: buyer.publicKey,
              ...dealAccounts,
              buyer_token_account: buyerAta,
            },
          ),
        ],
        [],
        state,
      );
      const funded = await snapshot("after fund");
      expect(
        funded.vault === amount,
        `vault holds ${funded.vault}, expected ${amount}`,
      );
    }

    const releaseIx = instruction(
      "release",
      {},
      {
        payer: buyer.publicKey,
        ...dealAccounts,
        seller: wallets.seller.publicKey,
        seller_token_account: sellerAta,
        buyer: buyer.publicKey,
      },
    );

    if (label === "held") {
      const atHold = (await readDeal(chain, dealPda)).state;
      if (atHold === "held" || atHold === "refunded") {
        skip("place_hold (title)", `already ${atHold}`);
      } else
        await send(
          deal.steps,
          "place_hold (title)",
          "title reviewer",
          [
            instruction(
              "place_hold",
              {
                role: { Title: {} },
                reason_code: { SellerIdentityDisputed: {} },
              },
              { reviewer: wallets.title.publicKey, deal: dealPda },
            ),
          ],
          [wallets.title],
          state,
        );
      if ((await readDeal(chain, dealPda)).state === "refunded") {
        skip("release (held)", "already refunded");
        skip("refund", "already refunded");
        if (deal.balances.at(-1)?.moment.startsWith("after refund") !== true) {
          // Nothing else moves these accounts between the refund and now.
          await snapshot("after refund (read when resuming)");
        }
        deal.finalState = "refunded";
        save();
        continue;
      }
      const rejectedBefore = resume
        ? (await chain.failedReleases?.(dealPda)) ?? []
        : [];
      if (rejectedBefore.length) {
        throw new Error(
          `held deal already has a failed release on chain (${rejectedBefore[0]}); refusing to guess where to resume`,
        );
      }
      const before = await snapshot("before release attempt (held)");

      const { entry, sent } = await send(
        deal.steps,
        "release (held)",
        "buyer (fee payer)",
        [releaseIx],
        [],
        state,
        true,
      );
      expect(!entry.ok, "release succeeded while held");
      const expected = `${heldError.name} (${heldError.code})`;
      expect(
        JSON.stringify(sent.err) ===
          JSON.stringify({
            InstructionError: [
              sent.instructionOffset,
              { Custom: heldError.code },
            ],
          }),
        `release failed with ${JSON.stringify(sent.err)}${
          entry.programError ? ` = ${entry.programError}` : ""
        }, expected ${expected}`,
      );
      expect(
        entry.programError === expected,
        `program error ${entry.programError}, expected ${expected}`,
      );
      const after = await snapshot("after rejected release");
      expect(
        after.buyer === before.buyer &&
          after.vault === before.vault &&
          after.seller === before.seller,
        "balances changed after a rejected release",
      );
      expect(
        entry.stateAfter === "held",
        "deal left held after rejected release",
      );

      await send(
        deal.steps,
        "refund",
        "buyer",
        [
          instruction(
            "refund",
            {},
            {
              buyer: buyer.publicKey,
              ...dealAccounts,
              buyer_token_account: buyerAta,
            },
          ),
        ],
        [],
        state,
      );
      const refunded = await snapshot("after refund");
      expect(
        refunded.buyer === before.buyer + amount,
        "buyer not refunded the exact amount",
      );
      expect(
        refunded.vault === null || refunded.vault === 0n,
        "vault not emptied",
      );
      expect(
        refunded.seller === before.seller,
        "seller balance changed on refund",
      );
    } else {
      if ((await readDeal(chain, dealPda)).state === "released") {
        skip("approvals and release", "already released");
        deal.finalState = "released";
        save();
        continue;
      }
      const approvedBefore = (await readDeal(chain, dealPda)).approvals;
      for (const r of REVIEWERS) {
        if (approvedBefore[r.role]) {
          skip(`sign_approval (${r.role})`, "already approved");
          continue;
        }
        await send(
          deal.steps,
          `sign_approval (${r.role})`,
          `${r.role} reviewer`,
          [
            instruction(
              "sign_approval",
              { role: { [r.variant]: {} } },
              { reviewer: wallets[r.role].publicKey, deal: dealPda },
            ),
          ],
          [wallets[r.role]],
          state,
        );
      }
      const approvals = (await readDeal(chain, dealPda)).approvals;
      expect(
        REVIEWERS.every((r) => approvals[r.role]),
        "not every reviewer approved",
      );
      const before = await snapshot("before release (all approved)");

      await send(
        deal.steps,
        "release",
        "buyer (fee payer)",
        [releaseIx],
        [],
        state,
      );
      const after = await snapshot("after release");
      expect(
        after.seller === before.seller + amount,
        "seller not paid the exact amount",
      );
      expect(after.buyer === before.buyer, "buyer balance changed on release");
      expect(after.vault === null || after.vault === 0n, "vault not emptied");
    }
    deal.finalState = await state();
    save();
  }
}

/**
 * The live deal, in two halves so its release can happen on stage:
 *   prep    initialize, fund, title and survey approvals (never the septic
 *           approval, so it cannot be released yet);
 *   finish  septic approval, then release to the seller.
 * Both halves skip steps already on chain, so either can be re-run safely.
 */
async function runStage(
  chain: Chain,
  wallets: Wallets,
  plan: DealPlan,
  phase: "init" | "prep" | "finish",
  results: Results,
) {
  const buyer = wallets.buyer;
  const { dealId, dealPda, vault, amount } = plan;
  const buyerAta = plan.buyerTokenAccount;
  const sellerAta = plan.sellerTokenAccount;
  const save = () => writeResults(results);
  const send = makeSend(chain, buyer, save);
  let deal = results.deals.find((d) => d.dealPda === dealPda.toBase58());
  if (!deal) {
    deal = {
      label: plan.outcome,
      fixtureId: plan.fixtureId,
      dealIdLabel: plan.dealIdLabel,
      dealIdHex: dealId.toString("hex"),
      dealPda: dealPda.toBase58(),
      vault: vault.toBase58(),
      steps: [],
      balances: [],
    };
    results.deals.push(deal);
  }
  const record = deal;
  const snapshot = makeSnapshot(
    chain,
    record,
    { buyerAta, vault, sellerAta },
    save,
  );
  const view = async () =>
    (await chain.account(dealPda)) ? readDeal(chain, dealPda) : null;
  const state = async () => (await readDeal(chain, dealPda)).state;
  const expect = (cond: boolean, what: string) => {
    if (!cond) throw new Error(`${plan.outcome} deal: ${what}`);
  };
  const skip = (step: string, why: string) =>
    console.log(`  skip   ${step.padEnd(22)} ${why}`);
  const dealAccounts = { deal: dealPda, vault, mint: MINT };
  const approve = async (r: (typeof REVIEWERS)[number]) => {
    if ((await readDeal(chain, dealPda)).approvals[r.role]) {
      skip(`sign_approval (${r.role})`, "already approved");
      return;
    }
    await send(
      record.steps,
      `sign_approval (${r.role})`,
      `${r.role} reviewer`,
      [
        instruction(
          "sign_approval",
          { role: { [r.variant]: {} } },
          { reviewer: wallets[r.role].publicKey, deal: dealPda },
        ),
      ],
      [wallets[r.role]],
      state,
    );
  };
  const [title, survey, septic] = REVIEWERS;
  console.log(`\n${plan.outcome} deal ${dealPda.toBase58()} (${phase})`);

  // Every send below, stage-init's included, goes through chain.send: on
  // devnet that is sendUntilLanded (priority fee, fresh blockhash, resend).
  if (phase === "init" || phase === "prep") {
    if (!(await chain.account(sellerAta))) {
      await send(
        results.setup,
        "create seller USDC account",
        "buyer (fee payer)",
        [
          createAssociatedTokenAccountIdempotentInstruction(
            buyer.publicKey,
            sellerAta,
            wallets.seller.publicKey,
            MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        ],
        [],
        async () => "-",
      );
    }
    const before = await view();
    if (before) {
      expect(
        before.state === "draft" || before.state === "funded",
        `already ${before.state}; prep only continues a draft or funded deal`,
      );
      expect(
        before.amount === amount,
        "on-chain amount differs from the fixture",
      );
      skip("initialize_deal", `already on chain (${before.state})`);
    } else {
      await send(
        record.steps,
        "initialize_deal",
        "buyer",
        [
          instruction(
            "initialize_deal",
            {
              deal_id: Array.from(dealId),
              amount: new BN(amount.toString()),
              reviewers: REVIEWERS.map((r) => ({
                wallet: wallets[r.role].publicKey,
                role: { [r.variant]: {} },
                required: true,
              })),
            },
            {
              buyer: buyer.publicKey,
              ...dealAccounts,
              seller: wallets.seller.publicKey,
              seller_token_account: sellerAta,
            },
          ),
        ],
        [],
        state,
      );
    }
    if (phase === "init") {
      // Funding is the buyer wallet's, through the Solana Pay QR.
      const after = await readDeal(chain, dealPda);
      expect(
        after.amount === amount,
        "on-chain amount differs from the fixture",
      );
      await snapshot("after stage-init (draft, nothing funded)");
      record.finalState = after.state;
      save();
      return;
    }
    if ((await readDeal(chain, dealPda)).state === "draft") {
      await send(
        record.steps,
        "fund",
        "buyer",
        [
          instruction(
            "fund",
            {},
            {
              buyer: buyer.publicKey,
              ...dealAccounts,
              buyer_token_account: buyerAta,
            },
          ),
        ],
        [],
        state,
      );
      const funded = await snapshot("after fund");
      expect(
        funded.vault === amount,
        `vault holds ${funded.vault}, expected ${amount}`,
      );
    } else skip("fund", "already funded");
    await approve(title!);
    await approve(survey!);
    const ready = await readDeal(chain, dealPda);
    expect(
      ready.state === "funded" &&
        ready.approvals.title === true &&
        ready.approvals.survey === true &&
        ready.approvals.septic === false,
      `expected funded with title and survey approved, got state ${
        ready.state
      }, approvals ${JSON.stringify(ready.approvals)}`,
    );
    await snapshot("after stage-prep (title and survey approved)");
  } else {
    const before = await view();
    expect(before !== null, "not on chain yet; run stage-prep first");
    if (before!.state === "released") {
      skip("sign_approval (septic)", "already released");
      skip("release", "already released");
      record.finalState = "released";
      save();
      return;
    }
    expect(
      before!.state === "funded" && !before!.hold,
      `expected funded with no hold, got ${before!.state}`,
    );
    expect(
      before!.approvals.title === true && before!.approvals.survey === true,
      "title and survey approvals are missing; run stage-prep first",
    );
    await approve(septic!);
    const pre = await snapshot("before release (all approved)");
    await send(
      record.steps,
      "release",
      "buyer (fee payer)",
      [
        instruction(
          "release",
          {},
          {
            payer: buyer.publicKey,
            ...dealAccounts,
            seller: wallets.seller.publicKey,
            seller_token_account: sellerAta,
            buyer: buyer.publicKey,
          },
        ),
      ],
      [],
      state,
    );
    const post = await snapshot("after release");
    expect(
      post.seller === pre.seller + amount,
      "seller not paid the exact amount",
    );
    expect(post.buyer === pre.buyer, "buyer balance changed on release");
    expect(post.vault === null || post.vault === 0n, "vault not emptied");
  }
  record.finalState = await state();
  save();
}

// ---------------------------------------------------------------- main

async function main() {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      flags[arg.slice(2)] = value;
    } else positional.push(arg);
  }
  const unknownFlags = Object.keys(flags).filter(
    (f) =>
      f !== "amount" && f !== "held-error" && f !== "resume" && f !== "deal",
  );
  if (unknownFlags.length) throw new Error(`unknown flags: ${unknownFlags}`);
  const mode = positional[0] ?? "check";
  if (
    positional.length > 1 ||
    ![
      "plan",
      "check",
      "simulate",
      "run",
      "stage-init",
      "stage-prep",
      "stage-finish",
    ].includes(mode)
  ) {
    throw new Error(
      `usage: demo-deals.ts [plan|check|simulate|run|stage-init|stage-prep|stage-finish] [--amount <usdc>] [--held-error <IDL error name>] [--resume <previous devnet-*.json>] [--deal staged-devnet-deal-live|staged-devnet-deal-rehearsal|staged-devnet-deal-rehearsal-v2|staged-devnet-deal-rehearsal-v3|staged-devnet-deal-pay-rehearsal]`,
    );
  }
  if (flags.resume && mode !== "run") {
    throw new Error("--resume only applies to run");
  }
  if (flags.deal && !mode.startsWith("stage-")) {
    throw new Error(
      "--deal only applies to stage-init, stage-prep, and stage-finish",
    );
  }
  if (
    flags.deal &&
    !(STAGE_DEAL_IDS as readonly string[]).includes(flags.deal)
  ) {
    throw new Error(
      `--deal must be one of ${STAGE_DEAL_IDS.join(", ")}; got ${flags.deal}`,
    );
  }
  // The rehearsal guards the devnet run only if it executes the same bytecode
  // devnet will. A local build would let a rehearsal pass that devnet fails.
  if (
    (mode === "run" || mode.startsWith("stage-")) &&
    localProgramPath() !== undefined
  ) {
    throw new Error(
      `${mode} refuses to start while LOCAL_PROGRAM_SO or ESCROW_PROGRAM_SO is set: the rehearsal must use the program deployed on devnet. Unset it, or use \`simulate\` to test a local build.`,
    );
  }
  const amount = flags.amount ? parseUsdc(flags.amount) : DEFAULT_AMOUNT;
  // What the rejected release on the held deal must fail with. The spec is
  // DealHeld (6019); see README "Held release error" for the deployed program.
  const heldError = programError(flags["held-error"] ?? "DealHeld");

  const { wallets, created } = loadOrCreateWallets();
  console.log(`GroundTruth demo closings: ${mode}`);
  console.log(
    `  program ${PROGRAM.toBase58()} (devnet), parcel ${PARCEL_KEY}, ${formatUsdc(
      amount,
    )} USDC per deal`,
  );
  console.log(
    `\nWallets in ${
      relative(process.cwd(), WALLET_DIR) || WALLET_DIR
    } (gitignored)${
      created.length ? `; generated now: ${created.join(", ")}` : ""
    }:`,
  );
  for (const role of ROLES)
    console.log(`  ${role.padEnd(7)} ${wallets[role].publicKey.toBase58()}`);
  const publicWallets = {
    ...Object.fromEntries(
      ROLES.map((r) => [r, wallets[r].publicKey.toBase58()]),
    ),
    "buyer USDC": getAssociatedTokenAddressSync(
      MINT,
      wallets.buyer.publicKey,
    ).toBase58(),
    "seller USDC": getAssociatedTokenAddressSync(
      MINT,
      wallets.seller.publicKey,
    ).toBase58(),
  };

  const plans = planDeals(wallets, amount);
  const runPlans = plans.filter((p) => RUN_OUTCOMES.includes(p.outcome));
  const livePlan = plans.find((p) => p.outcome === "live")!;
  // The current rehearsal deal: v1 was used up testing the reviewer portal
  // (#45), v2 testing the hardened transaction sending.
  const rehearsalPlan = plans.find((p) => p.outcome === "rehearsalV3")!;
  /** The deal stage-* drives: --deal, default the live one (stage-init: the Solana Pay rehearsal). */
  const stagePlan = plans.find(
    (p) =>
      p.fixtureId ===
      (flags.deal ??
        (mode === "stage-init"
          ? stagedPayRehearsalDeal.id
          : stagedLiveDeal.id)),
  )!;
  const mismatches = fixtureMismatches(wallets, plans);
  const reportMismatches = () => {
    if (!mismatches.length) {
      console.log(
        "\nPlan matches the backend's staged deals (packages/shared fixtures).",
      );
      return;
    }
    console.log("\nPLAN DOES NOT MATCH the backend's staged deals:");
    for (const m of mismatches) console.log(`  - ${m}`);
  };

  const devnet = devnetChain();
  const program = await withRpcRetry("getAccountInfo", () =>
    devnet.connection.getAccountInfo(PROGRAM, "confirmed"),
  );
  if (!program?.executable)
    throw new Error(`program ${PROGRAM} is not executable on devnet`);
  const reportExisting = async (which = plans) => {
    const existing = await existingDeals(devnet, which);
    console.log(
      existing.length
        ? `\nOn devnet:\n${existing.map((e) => `  - ${e}`).join("\n")}`
        : "\nOn devnet: none of these deal PDAs exists yet.",
    );
    return existing;
  };

  if (mode === "plan") {
    printPlan(wallets, plans);
    reportMismatches();
    await reportExisting();
    console.log("\nplan sends nothing.");
    process.exitCode = mismatches.length ? 1 : 0;
    return;
  }

  // Each results object gets its own setup/deals arrays (fresh below): the
  // rehearsal must never write into the devnet record.
  const base: Omit<Results, "mode" | "note" | "setup" | "deals"> = {
    status: "running",
    cluster: "devnet",
    rpc: RPC_URL,
    programId: PROGRAM.toBase58(),
    mint: MINT.toBase58(),
    parcelKey: PARCEL_KEY,
    amountBaseUnits: amount.toString(),
    expectedHeldReleaseError: `${heldError.name} (${heldError.code})`,
    runId: new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z"),
    startedAt: new Date().toISOString(),
    wallets: publicWallets,
  };

  const simulate = async () => {
    const { chain, deployed, recorded } = await simulationChain(
      wallets,
      amount,
    );
    const results: Results = {
      ...base,
      setup: [],
      deals: [],
      mode: "simulation",
      note: "LOCAL LITESVM SIMULATION of the deployed program's bytecode with a stand-in USDC mint. Not on chain; not proof of a devnet outcome.",
      simulatedProgram: {
        programData: deployed.programData,
        deploySlot: deployed.deploySlot,
        sha256: deployed.sha256,
      },
    };
    const status = await finish(results, () =>
      runClosings(chain, wallets, plans, amount, heldError, results),
    );
    const file = join(RESULTS_DIR, "simulation.transactions.json");
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          note: "LOCAL LITESVM SIMULATION, not devnet data. Transactions of both demo closings run on the deployed program's bytecode, in getTransaction jsonParsed shape (every instruction unparsed). Slots and block times are local stand-ins; signatures are real signatures over local transactions that were never sent to devnet.",
          status,
          programId: PROGRAM.toBase58(),
          simulatedProgram: results.simulatedProgram,
          deals: Object.fromEntries(
            plans.map((p) => [p.fixtureId, p.dealPda.toBase58()]),
          ),
          transactions: recorded,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`transactions: ${relative(process.cwd(), file)}`);
    return status;
  };

  /** Both halves of the live deal in LiteSVM on the deployed bytecode. */
  /** Both halves of a stage deal in LiteSVM on the deployed bytecode. */
  const rehearseStage = async (plan: DealPlan) => {
    console.log(
      `\nRehearsing the ${plan.outcome} deal (stage-prep, then stage-finish) locally:`,
    );
    const { chain } = await simulationChain(wallets, plan.amount);
    const rehearsal: Results = {
      ...base,
      runId: `${stageRunId(plan.outcome)}-simulation`,
      amountBaseUnits: plan.amount.toString(),
      setup: [],
      deals: [],
      mode: "simulation",
      note: `LOCAL LITESVM REHEARSAL of the ${plan.outcome} deal. Not on chain.`,
    };
    return finish(rehearsal, async () => {
      await runStage(chain, wallets, plan, "prep", rehearsal);
      await runStage(chain, wallets, plan, "finish", rehearsal);
    });
  };

  /** What stage-prep and stage-finish would do now for a stage deal, from devnet state. */
  const stageReadiness = async (plan: DealPlan) => {
    const deal = (await devnet.account(plan.dealPda))
      ? await readDeal(devnet, plan.dealPda)
      : null;
    const usdc = (await tokenBalance(devnet, plan.buyerTokenAccount)) ?? 0n;
    const sol = (await devnet.account(wallets.buyer.publicKey))?.lamports ?? 0n;
    const funded = usdc >= plan.amount && sol >= 50_000_000n;
    const prep = mismatches.length
      ? "not ready (plan differs from fixtures)"
      : !deal
      ? funded
        ? `ready (buyer has ${formatUsdc(usdc)} USDC, needs ${formatUsdc(
            plan.amount,
          )}; ${formatSol(sol)} SOL)`
        : `not ready: buyer has ${formatUsdc(usdc)} USDC / ${formatSol(
            sol,
          )} SOL, needs ${formatUsdc(plan.amount)} USDC and 0.05 SOL`
      : deal.state === "draft" ||
        (deal.state === "funded" &&
          !(deal.approvals.title && deal.approvals.survey))
      ? "partly done; re-running finishes it"
      : "done";
    const finish = !deal
      ? "not ready (run stage-prep first)"
      : deal.state === "released"
      ? "done (released)"
      : deal.state === "funded" && deal.approvals.title && deal.approvals.survey
      ? "ready (septic approval and release)"
      : `not ready (state ${deal.state}, approvals ${JSON.stringify(
          deal.approvals,
        )})`;
    const init = mismatches.length
      ? "not ready (plan differs from fixtures)"
      : deal
      ? `done (already on chain, ${deal.state})`
      : sol >= 50_000_000n
      ? `ready (buyer has ${formatSol(sol)} SOL; initialize moves no USDC)`
      : `not ready: buyer has ${formatSol(sol)} SOL, needs 0.05 SOL`;
    return { init, prep, finish };
  };

  /** stage-prep / stage-finish on a stage deal, with one persistent record per deal. */
  const stage = async (phase: "init" | "prep" | "finish", plan: DealPlan) => {
    console.log(
      `\nStage deal: ${plan.fixtureId} (${formatUsdc(plan.amount)} USDC)`,
    );
    reportMismatches();
    await reportExisting([plan]);
    const readiness = await stageReadiness(plan);
    const status = readiness[phase];
    console.log(`\n${mode}: ${status}`);
    if (mismatches.length) {
      process.exitCode = 1;
      return;
    }
    if (status.startsWith("done")) return;
    if (status.startsWith("not ready")) {
      process.exitCode = 1;
      return;
    }
    if (phase === "prep") {
      if ((await rehearseStage(plan)) !== "complete") {
        process.exitCode = 1;
        console.log("\nNot sending: the local rehearsal failed.");
        return;
      }
      console.log("\nRehearsal passed. Sending devnet transactions:");
    }
    // One record per stage deal across both halves, keeping only
    // signatures confirmed on devnet from any earlier attempt.
    const results: Results = {
      ...base,
      runId: stageRunId(plan.outcome),
      amountBaseUnits: plan.amount.toString(),
      setup: [],
      deals: [],
      mode: "devnet",
      note:
        phase === "init"
          ? `Staged GroundTruth ${plan.outcome} demo deal (${plan.fixtureId}) on Solana devnet with Circle test USDC: stage-init (initialize only). The buyer funds it from the deal page's Solana Pay QR. Public keys and signatures only.`
          : `Staged GroundTruth ${plan.outcome} demo deal (${plan.fixtureId}) on Solana devnet with Circle test USDC: stage-prep (init, fund, title and survey approvals) and stage-finish (septic approval, release). Public keys and signatures only.`,
    };
    const previousFile = resultPaths(results).json;
    if (existsSync(previousFile)) {
      const previous = JSON.parse(
        readFileSync(previousFile, "utf8"),
      ) as Results;
      const all = [
        ...previous.setup,
        ...previous.deals.flatMap((d) => d.steps),
      ].map((st) => st.signature);
      const onDevnet = (await devnet.confirmed?.(all)) ?? new Set<string>();
      results.startedAt = previous.startedAt;
      results.setup = previous.setup.filter((st) => onDevnet.has(st.signature));
      results.deals = previous.deals.map((d) => ({
        ...d,
        steps: d.steps.filter((st) => onDevnet.has(st.signature)),
      }));
    }
    await finish(results, () =>
      runStage(devnet, wallets, plan, phase, results),
    );
  };

  if (
    mode === "stage-init" ||
    mode === "stage-prep" ||
    mode === "stage-finish"
  ) {
    await stage(
      mode === "stage-init"
        ? "init"
        : mode === "stage-prep"
        ? "prep"
        : "finish",
      stagePlan,
    );
    return;
  }

  if (mode === "simulate") {
    if (mismatches.length) reportMismatches();
    const closings = await simulate();
    const live = await rehearseStage(livePlan);
    const rehearsal = await rehearseStage(rehearsalPlan);
    process.exitCode =
      closings === "complete" && live === "complete" && rehearsal === "complete"
        ? 0
        : 1;
    return;
  }

  reportMismatches();
  const existing = await reportExisting(runPlans);
  // Resuming: the held deal's escrowed amount comes back to the buyer on
  // refund before the released deal is funded, so it counts toward the need.
  let credit = 0n;
  if (flags.resume) {
    const [heldPlan, releasedPlan] = plans as [DealPlan, DealPlan];
    const held = (await devnet.account(heldPlan.dealPda))
      ? await readDeal(devnet, heldPlan.dealPda)
      : null;
    const released = (await devnet.account(releasedPlan.dealPda))
      ? await readDeal(devnet, releasedPlan.dealPda)
      : null;
    if (held && !["draft", "funded", "held", "refunded"].includes(held.state)) {
      throw new Error(`held deal is ${held.state}; cannot resume`);
    }
    if (released && ["held", "refunded"].includes(released.state)) {
      throw new Error(`released deal is ${released.state}; cannot resume`);
    }
    if (held && (held.state === "funded" || held.state === "held")) {
      credit = (await tokenBalance(devnet, heldPlan.vault)) ?? 0n;
    }
  }
  const funding = await checkFunding(devnet, wallets, amount, credit);
  // The run's funding advice only matters before its deals exist.
  if (!existing.length || flags.resume) printFunding(wallets, funding);
  const ready = funding.ok && !mismatches.length && !existing.length;
  if (mode === "check") {
    const live = await stageReadiness(livePlan);
    const rehearsal = await stageReadiness(rehearsalPlan);
    console.log(
      `\nReadiness:\n  run                       ${
        ready
          ? "ready"
          : existing.length
          ? "done or started (deal PDAs exist)"
          : "not ready"
      }\n  stage-prep                ${
        live.prep
      }\n  stage-finish              ${
        live.finish
      }\n  stage-prep   (rehearsal)  ${
        rehearsal.prep
      }\n  stage-finish (rehearsal)  ${
        rehearsal.finish
      }\n  (rehearsal: add --deal ${stagedRehearsalV3Deal.id})`,
    );
    process.exitCode =
      ready ||
      [live, rehearsal].some(
        (st) => st.prep.startsWith("ready") || st.finish.startsWith("ready"),
      )
        ? 0
        : 1;
    return;
  }
  if (mismatches.length) {
    process.exitCode = 1;
    console.log(
      "\nNot running: the plan differs from the backend's staged deals, so the API would not record these closings.",
    );
    return;
  }
  if (existing.length && !flags.resume) {
    process.exitCode = 1;
    console.log(
      "\nNot running: a deal PDA already exists. Deal IDs are fixed, so a new pair needs new labels in STAGED_DEAL_ID_LABELS (and fixtures).",
    );
    return;
  }
  if (!funding.ok) {
    process.exitCode = 1;
    console.log("\nNot running: fund the buyer first.");
    return;
  }
  // Rehearse the whole flow on the deployed bytecode first, so a mismatch
  // shows up locally instead of after spending faucet funds.
  console.log("\nRehearsing both closings locally before touching devnet:");
  if ((await simulate()) !== "complete") {
    process.exitCode = 1;
    console.log("\nNot running on devnet: the local rehearsal failed.");
    return;
  }
  console.log("\nRehearsal passed. Sending devnet transactions:");
  const results: Results = {
    ...base,
    setup: [],
    deals: [],
    mode: "devnet",
    note: "Staged GroundTruth demo closings on Solana devnet with Circle test USDC, recorded by escrow/scripts/demo-deals.ts. Public keys and signatures only.",
  };
  if (flags.resume) {
    // Carry over only what the previous run really sent: entries whose
    // signatures are confirmed on devnet (drops anything else, such as
    // rehearsal entries a buggy earlier version mixed in).
    const previous = JSON.parse(readFileSync(flags.resume, "utf8")) as Results;
    const all = [
      ...previous.setup,
      ...previous.deals.flatMap((d) => d.steps),
    ].map((step) => step.signature);
    const onDevnet = (await devnet.confirmed?.(all)) ?? new Set<string>();
    results.resumedFrom = {
      file: relative(process.cwd(), flags.resume),
      runId: previous.runId,
      keptSignatures: onDevnet.size,
      droppedSignatures: all.length - onDevnet.size,
    };
    results.setup = previous.setup.filter((st) => onDevnet.has(st.signature));
    results.deals = previous.deals
      .filter((d) => d.steps.some((st) => onDevnet.has(st.signature)))
      .map((d) => ({
        ...d,
        steps: d.steps.filter((st) => onDevnet.has(st.signature)),
      }));
    console.log(
      `\nResuming ${previous.runId}: kept ${
        onDevnet.size
      } devnet signatures, dropped ${
        all.length - onDevnet.size
      } not on devnet.`,
    );
  }
  await finish(results, () =>
    runClosings(
      devnet,
      wallets,
      plans,
      amount,
      heldError,
      results,
      Boolean(flags.resume),
    ),
  );
}

async function finish(
  results: Results,
  body: () => Promise<void>,
): Promise<Results["status"]> {
  try {
    await body();
    results.status = "complete";
  } catch (error) {
    results.status = "failed";
    results.error =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    process.exitCode = 1;
    console.error(`\n${error instanceof Error ? error.message : error}`);
  } finally {
    results.finishedAt = new Date().toISOString();
    const paths = writeResults(results);
    console.log(
      `\n${results.status}: ${relative(process.cwd(), paths.json)}, ${relative(
        process.cwd(),
        paths.md,
      )}`,
    );
  }
  return results.status;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
