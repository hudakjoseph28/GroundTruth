// Solana Pay transaction request for funding a draft deal: who may ask,
// in which state, and exactly which transaction comes back (unsigned).
import { BN, BorshCoder, web3, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  SOLANA_PAY_DEVNET_GENESIS_HASH,
  TOKEN_PROGRAM_ID,
  USDC_MINT_DEVNET,
  solanaPayFundPath,
  solanaPayUrl,
  stagedDemoChainAccounts,
  stagedPayRehearsalDeal,
} from "@groundtruth/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FundChain } from "../src/chain/fundTransaction.js";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("../src/db.js", () => ({
  prisma: { dealRecord: { findUnique } },
}));

const { createApp } = await import("../src/app.js");

const deal = stagedPayRehearsalDeal;
const chainAccounts = stagedDemoChainAccounts[deal.id];
const PATH = solanaPayFundPath(deal.id);
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
const coder = new BorshCoder(GROUNDTRUTH_ESCROW_IDL as unknown as Idl);
const key = (k: string) => new web3.PublicKey(k);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: deal.id,
    parcelKey: deal.parcelKey,
    buyerWallet: deal.buyerWallet,
    sellerWallet: deal.sellerWallet,
    sellerTokenAccount: deal.sellerTokenAccount,
    amountBaseUnits: deal.amountBaseUnits,
    mint: deal.mint,
    cluster: "devnet",
    state: "draft",
    escrowAddress: deal.escrowAddress,
    publicDemo: true,
    ...overrides,
  };
}

/** The deal's DealAccount as the program stores it, via Anchor's coder. */
async function dealAccount(
  overrides: Record<string, unknown> = {},
): Promise<Buffer> {
  return coder.accounts.encode("DealAccount", {
    deal_id: Array.from(Buffer.from(chainAccounts.dealIdHex, "hex")),
    buyer: key(deal.buyerWallet),
    seller: key(deal.sellerWallet),
    seller_token_account: key(deal.sellerTokenAccount),
    mint: key(USDC_MINT_DEVNET),
    vault: key(chainAccounts.vault),
    amount: new BN(deal.amountBaseUnits),
    state: { Draft: {} },
    reviewers: deal.reviewers.map((r) => ({
      wallet: key(r.wallet),
      role: { [r.role[0]!.toUpperCase() + r.role.slice(1)]: {} },
      required: r.required,
      approved: false,
    })),
    hold: null,
    bump: 255,
    ...overrides,
  });
}

let chain: {
  genesisHash: ReturnType<typeof vi.fn>;
  account: ReturnType<typeof vi.fn>;
  latestBlockhash: ReturnType<typeof vi.fn>;
};

function app() {
  return createApp("test-commit", {
    solanaPay: {
      chain: chain as unknown as FundChain,
      iconUrl: "https://example.test/icon.svg",
    },
  });
}

beforeEach(async () => {
  const data = await dealAccount();
  chain = {
    genesisHash: vi.fn(async () => SOLANA_PAY_DEVNET_GENESIS_HASH),
    account: vi.fn(async () => ({ owner: GROUNDTRUTH_PROGRAM_ID, data })),
    latestBlockhash: vi.fn(async () => ({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1000,
    })),
  };
  findUnique.mockResolvedValue(row());
});

afterEach(() => {
  findUnique.mockReset();
  vi.restoreAllMocks();
});

const post = (body: unknown, path = PATH) =>
  request(app())
    .post(path)
    .set("content-type", "application/json")
    .send(JSON.stringify(body));

describe("Solana Pay URL", () => {
  it("leaves a query-free link unencoded and encodes one with a query", () => {
    expect(solanaPayUrl(`https://gt.example${PATH}`)).toBe(
      `solana:https://gt.example/api/deals/${deal.id}/solana-pay/fund`,
    );
    expect(solanaPayUrl("https://gt.example/pay?x=1")).toBe(
      "solana:https%3A%2F%2Fgt.example%2Fpay%3Fx%3D1",
    );
  });
});

describe("GET /api/deals/:id/solana-pay/fund", () => {
  it("answers the label and icon with open CORS", async () => {
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      label: "GroundTruth escrow (devnet)",
      icon: "https://example.test/icon.svg",
    });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("answers a CORS preflight", async () => {
    const res = await request(app()).options(PATH);
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("404s a deal that is missing or not public", async () => {
    findUnique.mockResolvedValueOnce(row({ publicDemo: false }));
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No public deal has this ID.");
  });
});

describe("POST /api/deals/:id/solana-pay/fund", () => {
  it("builds the buyer's unsigned fund transaction with the IDL's accounts", async () => {
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.message).toBe(
      `Fund deal ${deal.id}: 1 test USDC into escrow on devnet.`,
    );
    expect(chain.account).toHaveBeenCalledWith(deal.escrowAddress);

    const tx = web3.Transaction.from(
      Buffer.from(res.body.transaction, "base64"),
    );
    expect(tx.feePayer?.toBase58()).toBe(deal.buyerWallet);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    // One signature slot, the buyer's, and it is empty: the API never signs.
    expect(tx.signatures).toHaveLength(1);
    expect(tx.signatures[0]!.publicKey.toBase58()).toBe(deal.buyerWallet);
    expect(tx.signatures[0]!.signature).toBeNull();
    expect(tx.compileMessage().header.numRequiredSignatures).toBe(1);

    expect(tx.instructions).toHaveLength(1);
    const [ix] = tx.instructions;
    expect(ix!.programId.toBase58()).toBe(GROUNDTRUTH_PROGRAM_ID);
    expect(Buffer.from(ix!.data)).toEqual(coder.instruction.encode("fund", {}));
    expect(
      ix!.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
    ).toEqual([
      [deal.buyerWallet, true, true],
      [deal.escrowAddress, false, true],
      [chainAccounts.buyerTokenAccount, false, true],
      [chainAccounts.vault, false, true],
      [USDC_MINT_DEVNET, false, false],
      [TOKEN_PROGRAM_ID, false, false],
    ]);
  });

  it.each([
    ["the seller", deal.sellerWallet],
    ["a reviewer", deal.reviewers[0]!.wallet],
    ["an unrelated wallet", web3.Keypair.generate().publicKey.toBase58()],
  ])(
    "refuses %s with 403 and reads nothing from devnet",
    async (_who, wallet) => {
      const res = await post({ account: wallet });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.message).toMatch(
        /^Only the deal's buyer wallet can fund it/,
      );
      expect(res.body.message.length).toBeLessThanOrEqual(80);
      expect(res.body.transaction).toBeUndefined();
      expect(chain.account).not.toHaveBeenCalled();
    },
  );

  it.each(["funded", "held", "released", "refunded"])(
    "refuses a deal the API shows as %s with 409",
    async (state) => {
      findUnique.mockResolvedValueOnce(row({ state }));
      const res = await post({ account: deal.buyerWallet });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.message).toBe(
        `This deal is already ${state}; it can be funded only once.`,
      );
      expect(chain.account).not.toHaveBeenCalled();
    },
  );

  it("refuses when devnet already shows the deal funded (chain wins)", async () => {
    const data = await dealAccount({ state: { Funded: {} } });
    chain.account.mockResolvedValueOnce({
      owner: GROUNDTRUTH_PROGRAM_ID,
      data,
    });
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Devnet shows this deal is already funded.");
    expect(chain.latestBlockhash).not.toHaveBeenCalled();
  });

  it("refuses a deal whose escrow is not initialized on devnet", async () => {
    chain.account.mockResolvedValueOnce(null);
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "This deal's escrow is not set up on devnet yet.",
    );
  });

  it.each([
    ["amount", { amount: new BN("2000000") }],
    ["vault", { vault: web3.Keypair.generate().publicKey }],
    ["buyer", { buyer: web3.Keypair.generate().publicKey }],
  ])(
    "refuses when the on-chain %s differs from the deal",
    async (_f, change) => {
      const data = await dealAccount(change);
      chain.account.mockResolvedValueOnce({
        owner: GROUNDTRUTH_PROGRAM_ID,
        data,
      });
      const res = await post({ account: deal.buyerWallet });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        "The escrow on devnet does not match this deal. Nothing was built.",
      );
    },
  );

  it("refuses an account another program owns", async () => {
    const data = await dealAccount();
    chain.account.mockResolvedValueOnce({ owner: TOKEN_PROGRAM_ID, data });
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(409);
  });

  it("refuses to build when the RPC is not devnet", async () => {
    chain.genesisHash.mockResolvedValue(
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    );
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(503);
    expect(res.body.message).toBe(
      "This server is not connected to Solana devnet.",
    );
    expect(chain.account).not.toHaveBeenCalled();
  });

  it("answers a retryable 502 when devnet does not answer", async () => {
    chain.account.mockRejectedValueOnce(new Error("fetch failed"));
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
  });

  it.each([
    ["no body", undefined],
    ["a non-base58 account", { account: "not-a-wallet-address-0OIl" }],
    ["a missing account", { wallet: deal.buyerWallet }],
  ])("400s %s", async (_what, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("accepts extra request fields, as the spec asks", async () => {
    const res = await post({ account: deal.buyerWallet, future: true });
    expect(res.status).toBe(200);
  });

  it("refuses a deal that is not on devnet test USDC", async () => {
    findUnique.mockResolvedValueOnce(row({ cluster: "mainnet-beta" }));
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(409);
    expect(chain.account).not.toHaveBeenCalled();
  });

  it("404s an unknown deal", async () => {
    findUnique.mockResolvedValueOnce(null);
    const res = await post({ account: deal.buyerWallet });
    expect(res.status).toBe(404);
  });
});
