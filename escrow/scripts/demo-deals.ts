/**
 * Runs GroundTruth's two staged demo closings against the escrow program on
 * Solana devnet, built from the checked-in IDL with @solana/web3.js (no
 * Solana CLI).
 *
 *   pnpm --filter @groundtruth/escrow demo:deals                 # check (default)
 *   pnpm --filter @groundtruth/escrow demo:deals simulate        # local, no devnet tx
 *   pnpm --filter @groundtruth/escrow demo:deals run             # sends devnet txs
 *   ... demo:deals <mode> --amount 20                            # deal size in USDC
 *   ... demo:deals <mode> --held-error InvalidDealState          # see below
 *
 * Modes:
 *   check     Generates (or loads) the demo keypairs, prints their public keys,
 *             reads SOL and USDC balances on devnet, and prints exactly what to
 *             fund. Sends nothing.
 *   simulate  Runs both closings in LiteSVM against the deployed program's
 *             own bytecode (read from devnet). The USDC mint is replaced by a
 *             local stand-in at Circle's address so the buyer can be funded;
 *             nothing touches devnet. Output: demo-results/simulation.* (gitignored).
 *   run       Refuses unless `check` passes and a `simulate` rehearsal of the
 *             same run passes, then runs both closings on devnet and writes
 *             demo-results/devnet-<runId>.{json,md}, updated after every
 *             transaction so a partial run is still recorded.
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
  USDC_MINT_DEVNET,
  stagedDeal,
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

const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM = new PublicKey(GROUNDTRUTH_PROGRAM_ID);
const MINT = new PublicKey(USDC_MINT_DEVNET);
const PARCEL_KEY = stagedDeal.parcelKey; // ohio:39049:230-000918
const USDC_DECIMALS = 6;
const DEFAULT_AMOUNT = BigInt(stagedDeal.amountBaseUnits); // 25 USDC

/** 8-byte discriminator + DealAccount::INIT_SPACE with 8 reviewers (529). */
const DEAL_ACCOUNT_SPACE = 537;
const TOKEN_ACCOUNT_SPACE = 165;
/** Devnet base fee per signature; the script adds no priority fees. */
const FEE_PER_SIGNATURE = 5000n;
/**
 * Signatures in a full run: seller ATA 1; held: init 1, fund 1, hold 2,
 * release 1, refund 1; released: init 1, fund 1, approvals 3 x 2, release 1.
 */
const SIGNATURES_PER_RUN = 16n;
/** Headroom on top of the computed SOL need. */
const SOL_MARGIN = 10_000_000n; // 0.01 SOL

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

// ---------------------------------------------------------------- chains

interface Sent {
  signature: string;
  slot: number | null;
  /** RPC-shaped error, e.g. { InstructionError: [0, { Custom: 6019 }] }. */
  err: unknown;
  logs: string[];
}

interface AccountView {
  data: Buffer;
  owner: PublicKey;
  lamports: bigint;
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

function devnetChain(): Chain & { connection: Connection } {
  const connection = new Connection(RPC_URL, "confirmed");
  return {
    kind: "devnet",
    connection,
    async send(ixs, feePayer, signers, opts = {}) {
      const latest = await connection.getLatestBlockhash("confirmed");
      const tx = await signedTx(ixs, feePayer, signers, latest.blockhash);
      // A transaction expected to fail skips preflight, so the program's
      // rejection is recorded on chain instead of only in a simulation.
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: Boolean(opts.expectFailure),
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      for (let attempt = 0; attempt < 20; attempt++) {
        const got = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (got?.meta) {
          return {
            signature,
            slot: got.slot,
            err: got.meta.err,
            logs: got.meta.logMessages ?? [],
          };
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error(`${signature} confirmed but not readable yet`);
    },
    async account(key) {
      const info = await connection.getAccountInfo(key, "confirmed");
      return info
        ? {
            data: info.data,
            owner: info.owner,
            lamports: BigInt(info.lamports),
          }
        : null;
    },
    async rent(space) {
      return BigInt(await connection.getMinimumBalanceForRentExemption(space));
    },
  };
}

/** The deployed program's ELF: ProgramData account data after its 45-byte header, or local build if specified. */
async function deployedProgramBytes(connection: Connection) {
  const rawPath = process.env.LOCAL_PROGRAM_SO || process.env.ESCROW_PROGRAM_SO;
  const localSo = rawPath
    ? existsSync(rawPath)
      ? rawPath
      : existsSync(join(ESCROW_ROOT, rawPath))
        ? join(ESCROW_ROOT, rawPath)
        : null
    : null;
  if (localSo) {
    const elf = readFileSync(localSo);
    return {
      programData: "local-target-build",
      deploySlot: 0,
      sha256: createHash("sha256").update(elf).digest("hex"),
      elf,
    };
  }
  const program = await connection.getAccountInfo(PROGRAM, "confirmed");
  if (!program?.executable) throw new Error("program not found on devnet");
  const programData = new PublicKey(program.data.subarray(4, 36));
  const data = await connection.getAccountInfo(programData, "confirmed");
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
  const { address, getTransactionDecoder, lamports } =
    await import("@solana/kit");
  const deployed = await deployedProgramBytes(
    new Connection(RPC_URL, "confirmed"),
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
      return {
        signature: utils.bytes.bs58.encode(meta.signature()),
        slot: null,
        err,
        logs: meta.logs(),
      };
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
  return { chain, deployed };
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
): Promise<FundingCheck> {
  const buyer = wallets.buyer.publicKey;
  const sellerAta = getAssociatedTokenAddressSync(
    MINT,
    wallets.seller.publicKey,
  );
  const [buyerAcct, buyerUsdc, sellerAta_] = await Promise.all([
    chain.account(buyer),
    tokenBalance(chain, getAssociatedTokenAddressSync(MINT, buyer)),
    chain.account(sellerAta),
  ]);
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
    SOL_MARGIN;
  const buyerSol = buyerAcct?.lamports ?? 0n;
  return {
    ok: buyerSol >= needSol && (buyerUsdc ?? 0n) >= amount,
    buyerSol,
    buyerUsdc,
    needSol,
    needUsdc: amount,
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
}

interface Balances {
  moment: string;
  buyerUsdc: string;
  vaultUsdc: string | null;
  sellerUsdc: string;
}

interface DealResult {
  label: "held" | "released";
  dealIdPreimage: string;
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
  const base =
    results.mode === "devnet" ? `devnet-${results.runId}` : "simulation";
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
          : "Released deal: seller paid after every approval"
      }`,
      "",
      `- Deal PDA: ${addr(deal.dealPda)}`,
      `- Vault: ${addr(deal.vault)}`,
      `- Deal ID: \`${deal.dealIdHex}\` = sha256(\`${deal.dealIdPreimage}\`)`,
      ...(deal.finalState ? [`- Final state: **${deal.finalState}**`] : []),
      "",
      "| Step | Signer | Result | State after | Signature |",
      "| --- | --- | --- | --- | --- |",
      ...deal.steps.map(
        (s) =>
          `| ${s.step} | ${s.signer} | ${
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

async function runClosings(
  chain: Chain,
  wallets: Wallets,
  amount: bigint,
  heldError: ProgramError,
  results: Results,
) {
  const buyer = wallets.buyer;
  const buyerAta = getAssociatedTokenAddressSync(MINT, buyer.publicKey);
  const sellerAta = getAssociatedTokenAddressSync(
    MINT,
    wallets.seller.publicKey,
  );
  const save = () => writeResults(results);

  const send = async (
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

  for (const label of ["held", "released"] as const) {
    const preimage = `groundtruth-demo|${PARCEL_KEY}|${label}|${results.runId}`;
    const dealId = createHash("sha256").update(preimage).digest();
    const [dealPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), buyer.publicKey.toBuffer(), dealId],
      PROGRAM,
    );
    const vault = getAssociatedTokenAddressSync(MINT, dealPda, true);
    const deal: DealResult = {
      label,
      dealIdPreimage: preimage,
      dealIdHex: dealId.toString("hex"),
      dealPda: dealPda.toBase58(),
      vault: vault.toBase58(),
      steps: [],
      balances: [],
    };
    results.deals.push(deal);
    console.log(`\n${label} deal ${dealPda.toBase58()}`);

    const state = async () => (await readDeal(chain, dealPda)).state;
    const snapshot = async (moment: string) => {
      const [b, v, s] = await Promise.all([
        tokenBalance(chain, buyerAta),
        tokenBalance(chain, vault),
        tokenBalance(chain, sellerAta),
      ]);
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
    const expect = (cond: boolean, what: string) => {
      if (!cond) throw new Error(`${label} deal: ${what}`);
    };
    const dealAccounts = { deal: dealPda, vault, mint: MINT };

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
    expect(
      initialized.state === "draft" && initialized.amount === amount,
      "initialize did not bind the amount in draft",
    );

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
          JSON.stringify({ InstructionError: [0, { Custom: heldError.code }] }),
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
      for (const r of REVIEWERS) {
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
    (f) => f !== "amount" && f !== "held-error",
  );
  if (unknownFlags.length) throw new Error(`unknown flags: ${unknownFlags}`);
  const mode = positional[0] ?? "check";
  if (positional.length > 1 || !["check", "simulate", "run"].includes(mode)) {
    throw new Error(
      `usage: demo-deals.ts [check|simulate|run] [--amount <usdc>] [--held-error <IDL error name>]`,
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

  const devnet = devnetChain();
  const program = await devnet.connection.getAccountInfo(PROGRAM, "confirmed");
  if (!program?.executable)
    throw new Error(`program ${PROGRAM} is not executable on devnet`);

  const base: Omit<Results, "mode" | "note"> = {
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
    setup: [],
    deals: [],
  };

  const simulate = async () => {
    const { chain, deployed } = await simulationChain(wallets, amount);
    const results: Results = {
      ...base,
      mode: "simulation",
      note: "LOCAL LITESVM SIMULATION of the deployed program's bytecode with a stand-in USDC mint. Not on chain; not proof of a devnet outcome.",
      simulatedProgram: {
        programData: deployed.programData,
        deploySlot: deployed.deploySlot,
        sha256: deployed.sha256,
      },
    };
    return finish(results, () =>
      runClosings(chain, wallets, amount, heldError, results),
    );
  };

  if (mode === "simulate") {
    await simulate();
    return;
  }

  const funding = await checkFunding(devnet, wallets, amount);
  printFunding(wallets, funding);
  if (mode === "check") {
    process.exitCode = funding.ok ? 0 : 1;
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
    mode: "devnet",
    note: "Staged GroundTruth demo closings on Solana devnet with Circle test USDC, recorded by escrow/scripts/demo-deals.ts. Public keys and signatures only.",
  };
  await finish(results, () =>
    runClosings(devnet, wallets, amount, heldError, results),
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
