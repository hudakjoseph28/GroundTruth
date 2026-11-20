// Fee sponsorship routes: GET /api/fee-sponsor and
// POST /api/deals/:id/sponsored-transaction. Devnet is faked (no network).
import { Buffer } from "node:buffer";
import { createPublicKey, verify } from "node:crypto";
import { utils, web3 } from "@anchor-lang/core";
import {
  COMPUTE_BUDGET_PROGRAM_ID,
  GROUNDTRUTH_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  escrowInstructionName,
  stagedDeal,
  stagedLiveDeal,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { SponsorChain } from "../src/actions/devnetChain.js";
import { createApp } from "../src/app.js";
import {
  DEFAULT_MAX_SPONSORED_PER_DEAL,
  readFeeSponsor,
  stagedParticipants,
} from "../src/sponsor/feePayer.js";
import { memorySponsorLedger } from "../src/sponsor/ledger.js";
import { createRateLimiter } from "../src/sponsor/rateLimit.js";
import {
  SPONSOR_DEAL,
  dealAccount,
  fakeSponsorChain,
} from "./support/sponsorChain.js";

const DEAL = SPONSOR_DEAL;
const PATH = `/api/deals/${DEAL.id}/sponsored-transaction`;
const [TITLE, SURVEY, SEPTIC] = DEAL.reviewers.map((r) => r.wallet) as [
  string,
  string,
  string,
];
const OUTSIDER = web3.Keypair.generate().publicKey.toBase58();

function setup(
  options: {
    chain?: SponsorChain;
    maxPerDeal?: number;
    perWallet?: number;
    off?: boolean;
  } = {},
) {
  const keypair = web3.Keypair.generate();
  const ledger = memorySponsorLedger();
  const chain = options.chain ?? fakeSponsorChain();
  const app = createApp("test-commit", {
    feeSponsor: {
      config: options.off
        ? undefined
        : { keypair, maxPerDeal: options.maxPerDeal ?? 12 },
      chain,
      ledger,
      limiter: createRateLimiter({
        perWallet: options.perWallet ?? 100,
        global: 1_000,
        windowMs: 60_000,
      }),
    },
  });
  return { app, keypair, ledger, chain };
}

const approveBody = (account = SEPTIC, extra: object = {}) => ({
  action: "sign_approval",
  account,
  role: "septic",
  ...extra,
});

function decode(base64: string) {
  return web3.VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
}

/** True when `signature` is `key`'s ed25519 signature over `message`. */
function signedBy(
  key: web3.PublicKey,
  message: Uint8Array,
  signature: Uint8Array,
) {
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    key.toBuffer(),
  ]);
  return verify(
    null,
    Buffer.from(message),
    createPublicKey({ key: der, format: "der", type: "spki" }),
    Buffer.from(signature),
  );
}

describe("GET /api/fee-sponsor", () => {
  it("says off when no fee-payer key is configured", async () => {
    const { app } = setup({ off: true });
    const res = await request(app).get("/api/fee-sponsor");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false });
  });

  it("names the fee payer and the per-deal cap when on", async () => {
    const { app, keypair } = setup({ maxPerDeal: 7 });
    const res = await request(app).get("/api/fee-sponsor");
    expect(res.body).toEqual({
      enabled: true,
      feePayer: keypair.publicKey.toBase58(),
      maxPerDeal: 7,
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("POST /api/deals/:id/sponsored-transaction", () => {
  it("returns sign_approval signed by the fee payer only, with the reviewer's slot empty", async () => {
    const { app, keypair, ledger } = setup();
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({
      feePayer: keypair.publicKey.toBase58(),
      action: "sign_approval",
      lastValidBlockHeight: 1_000,
    });

    const tx = decode(res.body.transaction);
    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    expect(keys[0]).toBe(keypair.publicKey.toBase58());
    expect(keys[1]).toBe(SEPTIC);
    expect(tx.message.header.numRequiredSignatures).toBe(2);
    // The fee payer signed the exact message; the reviewer has not.
    const message = tx.message.serialize();
    expect(signedBy(keypair.publicKey, message, tx.signatures[0]!)).toBe(true);
    expect(tx.signatures[1]!.every((b) => b === 0)).toBe(true);
    expect(res.body.signature).toBe(utils.bytes.bs58.encode(tx.signatures[0]!));

    const programs = tx.message.compiledInstructions.map(
      (ix) => keys[ix.programIdIndex],
    );
    expect(programs).toEqual([
      COMPUTE_BUDGET_PROGRAM_ID,
      COMPUTE_BUDGET_PROGRAM_ID,
      GROUNDTRUTH_PROGRAM_ID,
    ]);
    const escrow = tx.message.compiledInstructions[2]!;
    expect(escrowInstructionName(escrow.data)).toBe("sign_approval");
    // The program's `reviewer: Signer` is the reviewer's wallet, not the fee payer.
    expect(keys[escrow.accountKeyIndexes[0]!]).toBe(SEPTIC);
    expect(tx.message.isAccountSigner(escrow.accountKeyIndexes[0]!)).toBe(true);
    expect(escrow.accountKeyIndexes).not.toContain(0);

    expect(ledger.entries).toEqual([
      {
        dealId: DEAL.id,
        action: "sign_approval",
        wallet: SEPTIC,
        role: "septic",
        signature: res.body.signature,
      },
    ]);
  });

  it("sizes the compute limit from a simulation and caps the priority fee", async () => {
    const chain = fakeSponsorChain({ fees: [10_000_000] });
    const { app } = setup({ chain });
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(200);
    expect(chain.simulated).toHaveLength(1);
    const tx = decode(res.body.transaction);
    const [limit, price] = tx.message.compiledInstructions;
    expect(Buffer.from(limit!.data).readUInt32LE(1)).toBe(5_800);
    expect(Buffer.from(price!.data).readBigUInt64LE(1)).toBe(100_000n);
  });

  it("adds the reviewer-signed document memo when the approval relies on one", async () => {
    const { app } = setup();
    const sha = "0f".repeat(32);
    const res = await request(app)
      .post(PATH)
      .send(approveBody(SEPTIC, { documentSha256: sha }));
    expect(res.status).toBe(200);
    const tx = decode(res.body.transaction);
    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    const memo = tx.message.compiledInstructions.at(-1)!;
    expect(keys[memo.programIdIndex]).toBe(MEMO_PROGRAM_ID);
    expect(memo.accountKeyIndexes.map((i) => keys[i])).toEqual([SEPTIC]);
    expect(Buffer.from(memo.data).toString()).toBe(`groundtruth:doc:${sha}`);
  });

  it("returns place_hold for an assigned reviewer", async () => {
    const { app } = setup();
    const res = await request(app).post(PATH).send({
      action: "place_hold",
      account: TITLE,
      role: "title",
      reasonCode: "TITLE_EXCEPTION",
    });
    expect(res.status).toBe(200);
    const tx = decode(res.body.transaction);
    expect(
      escrowInstructionName(tx.message.compiledInstructions[2]!.data),
    ).toBe("place_hold");
  });

  it("returns release, with the reviewer as the release payer, once every required reviewer signed", async () => {
    const chain = fakeSponsorChain({
      data: dealAccount({
        approved: { title: true, survey: true, septic: true },
      }),
    });
    const { app, keypair } = setup({ chain });
    const res = await request(app)
      .post(PATH)
      .send({ action: "release", account: SURVEY });
    expect(res.status).toBe(200);
    const tx = decode(res.body.transaction);
    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    const ix = tx.message.compiledInstructions[2]!;
    expect(escrowInstructionName(ix.data)).toBe("release");
    expect(keys[ix.accountKeyIndexes[0]!]).toBe(SURVEY);
    expect(keys).toContain(DEAL.sellerTokenAccount);
    expect(keys[0]).toBe(keypair.publicKey.toBase58());
  });

  it.each([
    ["fund", {}],
    ["refund", {}],
    ["initialize_deal", {}],
    ["transfer", { lamports: 1_000_000, to: OUTSIDER }],
    ["sign_approval", { role: "notary" }],
    ["place_hold", { role: "title", reasonCode: "BECAUSE" }],
  ])(
    "refuses action %s %o with 400 and signs nothing",
    async (action, extra) => {
      const { app, ledger, chain } = setup();
      const res = await request(app)
        .post(PATH)
        .send({ action, account: TITLE, ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
      expect(res.body.error.message).toMatch(
        /sign_approval, place_hold, release/,
      );
      expect(ledger.entries).toHaveLength(0);
      expect(
        (chain as ReturnType<typeof fakeSponsorChain>).simulated,
      ).toHaveLength(0);
    },
  );

  it("refuses a body that is not JSON, or too large", async () => {
    const { app } = setup();
    const bad = await request(app)
      .post(PATH)
      .set("content-type", "application/json")
      .send("{nope");
    expect(bad.status).toBe(400);
    const big = await request(app)
      .post(PATH)
      .send({ ...approveBody(), pad: "x".repeat(5_000) });
    expect(big.status).toBe(400);
  });

  it("serves staged deals only", async () => {
    const { app } = setup();
    const res = await request(app)
      .post("/api/deals/some-real-deal/sponsored-transaction")
      .send(approveBody());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("answers 503 (sponsor off) when no key is configured, before reading devnet", async () => {
    const { app, chain } = setup({ off: true });
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(503);
    expect(res.body.error.details).toEqual({ sponsor: "off" });
    expect(
      (chain as ReturnType<typeof fakeSponsorChain>).simulated,
    ).toHaveLength(0);
  });

  it("refuses a wallet that is not an assigned reviewer, or asks for the wrong role", async () => {
    const { app, ledger } = setup();
    const outsider = await request(app).post(PATH).send(approveBody(OUTSIDER));
    expect(outsider.status).toBe(403);
    const buyer = await request(app)
      .post(PATH)
      .send({ action: "release", account: DEAL.buyerWallet });
    expect(buyer.status).toBe(403);
    const wrongRole = await request(app)
      .post(PATH)
      .send({ ...approveBody(TITLE), role: "survey" });
    expect(wrongRole.status).toBe(403);
    expect(wrongRole.body.error.message).toMatch(/as title, not survey/);
    expect(ledger.entries).toHaveLength(0);
  });

  it("refuses with 409 what the program would refuse: already signed, held, settled, release too early", async () => {
    const signed = setup();
    const again = await request(signed.app)
      .post(PATH)
      .send(approveBody(TITLE, { role: "title" }));
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already signed/);

    const early = await request(signed.app)
      .post(PATH)
      .send({ action: "release", account: SEPTIC });
    expect(early.status).toBe(409);
    expect(early.body.error.message).toMatch(/Not every required reviewer/);

    for (const state of ["Held", "Released", "Refunded", "Draft"] as const) {
      const { app, ledger } = setup({
        chain: fakeSponsorChain({ data: dealAccount({ state }) }),
      });
      const res = await request(app).post(PATH).send(approveBody());
      expect(res.status).toBe(409);
      expect(ledger.entries).toHaveLength(0);
    }
  });

  it("does not sign when the devnet simulation fails, and names the program error", async () => {
    const { app, ledger } = setup({
      chain: fakeSponsorChain({
        simulation: { err: { InstructionError: [2, { Custom: 6016 }] } },
      }),
    });
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ programError: "6016" });
    expect(ledger.entries).toHaveLength(0);
  });

  it("answers 503 (out of SOL) when the fee payer cannot pay, so the wallet can pay instead", async () => {
    const { app, ledger } = setup({
      chain: fakeSponsorChain({
        simulation: { err: "InsufficientFundsForFee" },
      }),
    });
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(503);
    expect(res.body.error.details).toEqual({ sponsor: "outOfSol" });
    expect(ledger.entries).toHaveLength(0);
  });

  it("never sponsors a deal the fee payer is a participant of", async () => {
    const keypair = web3.Keypair.generate();
    const ledger = memorySponsorLedger();
    const chain = fakeSponsorChain({
      data: dealAccount({
        reviewerWallet: { title: keypair.publicKey.toBase58() },
      }),
    });
    const app = createApp("test-commit", {
      feeSponsor: { config: { keypair, maxPerDeal: 12 }, chain, ledger },
    });
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(503);
    expect(res.body.error.details).toEqual({ sponsor: "misconfigured" });
    expect(chain.simulated).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);
  });

  it("refuses a cluster that is not devnet", async () => {
    const { app, ledger } = setup({
      chain: fakeSponsorChain({
        genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
      }),
    });
    const res = await request(app).post(PATH).send(approveBody());
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PROVIDER_TIMEOUT");
    expect(ledger.entries).toHaveLength(0);
  });

  it("rate-limits each wallet with 429 RATE_LIMITED", async () => {
    const { app } = setup({ perWallet: 2 });
    expect((await request(app).post(PATH).send(approveBody())).status).toBe(
      200,
    );
    expect((await request(app).post(PATH).send(approveBody())).status).toBe(
      200,
    );
    const third = await request(app).post(PATH).send(approveBody());
    expect(third.status).toBe(429);
    expect(third.body.error).toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
      details: { sponsor: "rateLimited" },
    });
    // Another wallet still gets an answer.
    const other = await request(app)
      .post(PATH)
      .send({
        action: "place_hold",
        account: SURVEY,
        role: "survey",
        reasonCode: "OTHER",
      });
    expect(other.status).toBe(200);
  });

  it("caps fee-payer signatures per deal", async () => {
    const { app, ledger } = setup({ maxPerDeal: 2 });
    for (let i = 0; i < 2; i += 1) {
      expect((await request(app).post(PATH).send(approveBody())).status).toBe(
        200,
      );
    }
    const over = await request(app).post(PATH).send(approveBody());
    expect(over.status).toBe(429);
    expect(over.body.error.details).toEqual({ sponsor: "dealCap" });
    expect(ledger.entries).toHaveLength(2);
  });
});

describe("readFeeSponsor", () => {
  const key = web3.Keypair.generate();
  const json = JSON.stringify([...key.secretKey]);

  it("is off without a key and reads a solana-keygen key with the default cap", () => {
    expect(readFeeSponsor({})).toBeUndefined();
    const config = readFeeSponsor({ FEE_SPONSOR_SECRET_KEY: json });
    expect(config?.keypair.publicKey.toBase58()).toBe(key.publicKey.toBase58());
    expect(config?.maxPerDeal).toBe(DEFAULT_MAX_SPONSORED_PER_DEAL);
    expect(
      readFeeSponsor({
        FEE_SPONSOR_SECRET_KEY: json,
        FEE_SPONSOR_MAX_PER_DEAL: "4",
      })?.maxPerDeal,
    ).toBe(4);
  });

  it("stops startup on a malformed key or cap", () => {
    expect(() => readFeeSponsor({ FEE_SPONSOR_SECRET_KEY: "[1,2,3]" })).toThrow(
      /64 bytes/,
    );
    expect(() => readFeeSponsor({ FEE_SPONSOR_SECRET_KEY: "nope" })).toThrow(
      /64 bytes/,
    );
    const bad = [...key.secretKey];
    bad[63] = (bad[63]! + 1) % 256;
    expect(() =>
      readFeeSponsor({ FEE_SPONSOR_SECRET_KEY: JSON.stringify(bad) }),
    ).toThrow(/valid ed25519/);
    expect(() =>
      readFeeSponsor({
        FEE_SPONSOR_SECRET_KEY: json,
        FEE_SPONSOR_MAX_PER_DEAL: "0",
      }),
    ).toThrow(/between 1 and 100/);
  });

  it("refuses a key that is a staged participant", () => {
    expect(() =>
      readFeeSponsor(
        { FEE_SPONSOR_SECRET_KEY: json },
        new Set([key.publicKey.toBase58()]),
      ),
    ).toThrow(/dedicated key/);
    const staged = stagedParticipants();
    for (const wallet of [
      stagedDeal.buyerWallet,
      stagedDeal.sellerWallet,
      stagedDeal.sellerTokenAccount,
      ...stagedLiveDeal.reviewers.map((r) => r.wallet),
      stagedLiveDeal.escrowAddress,
    ]) {
      expect(staged.has(wallet)).toBe(true);
    }
  });
});
