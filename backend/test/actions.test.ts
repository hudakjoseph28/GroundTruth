// The reviewer-approval Solana Action (Blink). Devnet is faked: tests make
// no network calls. The deal account is the real Borsh layout, encoded with
// the checked-in IDL's coder.
import { Buffer } from "node:buffer";
import { BN, BorshCoder, web3, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  USDC_MINT_DEVNET,
  stagedDemoChainAccounts,
  stagedRehearsalV2Deal,
  stagedReleasedDeal,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  DEVNET_GENESIS_HASH,
  type ActionChain,
} from "../src/actions/devnetChain.js";
import { createApp } from "../src/app.js";

const coder = new BorshCoder(GROUNDTRUTH_ESCROW_IDL as unknown as Idl);
const DEAL = stagedRehearsalV2Deal;
const PATH = `/api/actions/approve/${DEAL.id}`;
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
const [TITLE, SURVEY, SEPTIC] = DEAL.reviewers.map((r) => r.wallet) as [
  string,
  string,
  string,
];
const OUTSIDER = web3.Keypair.generate().publicKey.toBase58();

type State = "Draft" | "Funded" | "Held" | "Released" | "Refunded";

async function dealAccount(
  options: {
    state?: State;
    approved?: Partial<Record<"title" | "survey" | "septic", boolean>>;
    dealIdHex?: string;
    mint?: string;
  } = {},
): Promise<Buffer> {
  const variant = (name: string) => ({ [name]: {} });
  return coder.accounts.encode("DealAccount", {
    deal_id: [
      ...Buffer.from(
        options.dealIdHex ?? stagedDemoChainAccounts[DEAL.id].dealIdHex,
        "hex",
      ),
    ],
    buyer: new web3.PublicKey(DEAL.buyerWallet),
    seller: new web3.PublicKey(DEAL.sellerWallet),
    seller_token_account: new web3.PublicKey(DEAL.sellerTokenAccount),
    mint: new web3.PublicKey(options.mint ?? USDC_MINT_DEVNET),
    vault: new web3.PublicKey(stagedDemoChainAccounts[DEAL.id].vault),
    amount: new BN(DEAL.amountBaseUnits),
    state: variant(options.state ?? "Funded"),
    reviewers: DEAL.reviewers.map((r) => ({
      wallet: new web3.PublicKey(r.wallet),
      role: variant(r.role[0]!.toUpperCase() + r.role.slice(1)),
      required: r.required,
      approved: options.approved?.[r.role] ?? false,
    })),
    hold: null,
    bump: 255,
  });
}

/** Devnet as of 2026-11-19: funded, title and survey signed, septic not. */
function fakeChain(
  overrides: Partial<ActionChain> & { data?: Promise<Buffer> } = {},
): ActionChain & { reads: string[] } {
  const reads: string[] = [];
  const data =
    overrides.data ?? dealAccount({ approved: { title: true, survey: true } });
  return {
    reads,
    genesisHash: overrides.genesisHash ?? (async () => DEVNET_GENESIS_HASH),
    account:
      overrides.account ??
      (async (address) => {
        reads.push(address);
        return { owner: GROUNDTRUTH_PROGRAM_ID, data: await data };
      }),
    latestBlockhash: overrides.latestBlockhash ?? (async () => BLOCKHASH),
  };
}

const appWith = (chain: ActionChain) =>
  createApp("test-commit", { actions: { chain } });

function expectActionHeaders(res: request.Response) {
  expect(res.headers["access-control-allow-origin"]).toBe("*");
  expect(res.headers["access-control-allow-methods"]).toBe(
    "GET,POST,PUT,OPTIONS",
  );
  expect(res.headers["access-control-allow-headers"]).toBe(
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  );
  expect(res.headers["access-control-expose-headers"]).toBe(
    "X-Action-Version, X-Blockchain-Ids",
  );
  expect(res.headers["x-action-version"]).toBe("2.4");
  expect(res.headers["x-blockchain-ids"]).toBe(
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  );
}

describe("actions.json", () => {
  it("maps the Action API and the rehearsal deal page, with CORS on GET and OPTIONS", async () => {
    const app = appWith(fakeChain());
    const res = await request(app).get("/actions.json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rules: [
        { pathPattern: `/deals/${DEAL.id}`, apiPath: PATH },
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      ],
    });
    expectActionHeaders(res);

    const preflight = await request(app).options("/actions.json");
    expect(preflight.status).toBe(204);
    expectActionHeaders(preflight);
  });
});

describe("OPTIONS on an Action route", () => {
  it("answers the CORS preflight without reading devnet", async () => {
    const chain = fakeChain();
    const res = await request(appWith(chain))
      .options(PATH)
      .set("Origin", "https://dial.to")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expectActionHeaders(res);
    expect(chain.reads).toEqual([]);
  });
});

describe("GET the approval Action", () => {
  it("returns staged, devnet-labeled metadata with the chain's approval count", async () => {
    const chain = fakeChain();
    const res = await request(appWith(chain))
      .get(PATH)
      .set("Host", "api.example.test")
      .set("X-Forwarded-Proto", "https");

    expect(res.status).toBe(200);
    expectActionHeaders(res);
    expect(chain.reads).toEqual([DEAL.escrowAddress]);
    expect(res.body).toEqual({
      type: "action",
      icon: "https://api.example.test/api/actions/icon.svg",
      title: "GroundTruth · Staged devnet closing",
      description: expect.stringContaining(
        "On devnet now: funded, 2 of 3 required approvals signed.",
      ),
      label: "Sign my approval",
      links: {
        actions: [
          { type: "transaction", label: "Sign my approval", href: PATH },
        ],
      },
    });
    expect(res.body.description).toContain("Franklin County parcel 230-000918");
    expect(res.body.description).toContain("10 test USDC");
    expect(res.body.description).toContain("GroundTruth never signs for you");
    expect(res.body.description).toContain("Staged roles and test funds only.");
  });

  it("serves the icon it points to as SVG", async () => {
    const res = await request(appWith(fakeChain())).get(
      "/api/actions/icon.svg",
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/svg\+xml/);
    // supertest buffers image/* bodies.
    expect(Buffer.from(res.body).toString("utf8")).toContain(
      "STAGED · SOLANA DEVNET · TEST USDC",
    );
  });

  it.each([
    ["Held", "A reviewer placed a hold on this deal"],
    ["Released", "already released to the seller"],
    ["Refunded", "refunded to the buyer"],
    ["Draft", "isn't funded on Solana devnet yet"],
  ] as const)(
    "is disabled with the reason when devnet says %s",
    async (state, reason) => {
      const res = await request(
        appWith(fakeChain({ data: dealAccount({ state }) })),
      ).get(PATH);
      expect(res.status).toBe(200);
      expect(res.body.disabled).toBe(true);
      expect(res.body.error.message).toContain(reason);
      expect(res.body.description).not.toContain("On devnet now");
    },
  );

  it("is disabled once every reviewer has signed", async () => {
    const data = dealAccount({
      approved: { title: true, survey: true, septic: true },
    });
    const res = await request(appWith(fakeChain({ data }))).get(PATH);
    expect(res.body.disabled).toBe(true);
    expect(res.body.error.message).toContain("Every reviewer has signed");
  });

  it("still shows the Action, without a chain status, when devnet can't be read", async () => {
    const chain = fakeChain({
      account: async () => {
        throw new Error("fetch failed");
      },
    });
    const res = await request(appWith(chain)).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body.disabled).toBeUndefined();
    expect(res.body.description).not.toContain("On devnet now");
  });

  it("refuses every deal but the rehearsal deal", async () => {
    const chain = fakeChain();
    const res = await request(appWith(chain)).get(
      `/api/actions/approve/${stagedReleasedDeal.id}`,
    );
    expect(res.status).toBe(404);
    expectActionHeaders(res);
    expect(res.body.message).toBe(
      "Approval Blinks are open only for the staged rehearsal deal.",
    );
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      retryable: false,
    });
    expect(chain.reads).toEqual([]);
  });
});

describe("POST the approval Action", () => {
  it("returns an unsigned sign_approval for the septic reviewer, who hasn't signed", async () => {
    const res = await request(appWith(fakeChain()))
      .post(PATH)
      .send({ account: SEPTIC });

    expect(res.status).toBe(200);
    expectActionHeaders(res);
    expect(res.body.type).toBe("transaction");
    expect(res.body.message).toContain("septic reviewer");
    expect(res.body.message).toContain("does not move funds");

    const tx = web3.VersionedTransaction.deserialize(
      Buffer.from(res.body.transaction, "base64"),
    );
    // Unsigned: one signer (the reviewer, also fee payer), its slot empty.
    expect(tx.message.header.numRequiredSignatures).toBe(1);
    expect(tx.signatures).toHaveLength(1);
    expect([...tx.signatures[0]!].every((byte) => byte === 0)).toBe(true);
    expect(tx.message.recentBlockhash).toBe(BLOCKHASH);

    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    expect(keys[0]).toBe(SEPTIC);
    expect(tx.message.compiledInstructions).toHaveLength(1);
    const [ix] = tx.message.compiledInstructions;
    expect(keys[ix!.programIdIndex]).toBe(GROUNDTRUTH_PROGRAM_ID);
    expect(ix!.accountKeyIndexes.map((i) => keys[i])).toEqual([
      SEPTIC,
      DEAL.escrowAddress,
    ]);
    expect(tx.message.isAccountWritable(keys.indexOf(DEAL.escrowAddress))).toBe(
      true,
    );

    const decoded = coder.instruction.decode(Buffer.from(ix!.data));
    expect(decoded).toEqual({
      name: "sign_approval",
      data: { role: { Septic: {} } },
    });
  });

  it("uses the role the chain assigns to the wallet", async () => {
    const res = await request(appWith(fakeChain({ data: dealAccount() })))
      .post(PATH)
      .send({ account: SURVEY });
    expect(res.status).toBe(200);
    const tx = web3.VersionedTransaction.deserialize(
      Buffer.from(res.body.transaction, "base64"),
    );
    const decoded = coder.instruction.decode(
      Buffer.from(tx.message.compiledInstructions[0]!.data),
    );
    expect(decoded?.data).toEqual({ role: { Survey: {} } });
  });

  it("refuses a reviewer who already signed", async () => {
    const res = await request(appWith(fakeChain()))
      .post(PATH)
      .send({ account: TITLE });
    expect(res.status).toBe(409);
    expectActionHeaders(res);
    expect(res.body.message).toBe(
      "This wallet already signed its title approval on Solana devnet. Nothing more to sign.",
    );
    expect(res.body.transaction).toBeUndefined();
  });

  it("refuses a wallet that isn't an assigned reviewer, including the buyer", async () => {
    for (const account of [OUTSIDER, DEAL.buyerWallet, DEAL.sellerWallet]) {
      const res = await request(appWith(fakeChain()))
        .post(PATH)
        .send({ account });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain(
        "This wallet isn't an assigned reviewer on this deal.",
      );
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("refuses when devnet says the deal is held or settled", async () => {
    for (const state of ["Held", "Released", "Refunded", "Draft"] as const) {
      const res = await request(
        appWith(fakeChain({ data: dealAccount({ state }) })),
      )
        .post(PATH)
        .send({ account: SEPTIC });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.transaction).toBeUndefined();
    }
  });

  it("refuses when the deal account doesn't exist on devnet", async () => {
    const res = await request(appWith(fakeChain({ account: async () => null })))
      .post(PATH)
      .send({ account: SEPTIC });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("hasn't been created on Solana devnet");
  });

  it.each([
    ["a missing body", undefined],
    ["no account", {}],
    ["a non-base58 account", { account: "not a key" }],
    [
      "a base58 string that isn't 32 bytes",
      { account: "1111111111111111111111111111111" },
    ],
  ])("answers 400 for %s", async (_label, body) => {
    const chain = fakeChain();
    const req = request(appWith(chain)).post(PATH);
    const res = body === undefined ? await req : await req.send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(chain.reads).toEqual([]);
  });

  it("answers 400 for malformed JSON", async () => {
    const res = await request(appWith(fakeChain()))
      .post(PATH)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expectActionHeaders(res);
    expect(res.body.message).toBe(
      "The request body must be JSON with an `account` field.",
    );
  });

  it("refuses to build anything unless the RPC is devnet", async () => {
    const chain = fakeChain({
      genesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    });
    const res = await request(appWith(chain))
      .post(PATH)
      .send({ account: SEPTIC });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
    expect(chain.reads).toEqual([]);
  });

  it.each([
    [
      "an account the escrow program doesn't own",
      web3.SystemProgram.programId.toBase58(),
      {},
    ],
    [
      "another deal's account",
      GROUNDTRUTH_PROGRAM_ID,
      { dealIdHex: stagedDemoChainAccounts[stagedReleasedDeal.id].dealIdHex },
    ],
    [
      "a deal on another mint",
      GROUNDTRUTH_PROGRAM_ID,
      { mint: web3.Keypair.generate().publicKey.toBase58() },
    ],
  ])("answers 503, not a guess, for %s", async (_label, owner, change) => {
    const data = await dealAccount(change);
    const chain = fakeChain({ account: async () => ({ owner, data }) });
    const res = await request(appWith(chain))
      .post(PATH)
      .send({ account: SEPTIC });
    expect(res.status).toBe(503);
    expect(res.body.transaction).toBeUndefined();
  });

  it("answers 503 when devnet can't give a blockhash", async () => {
    const chain = fakeChain({
      latestBlockhash: async () => {
        throw new Error("429");
      },
    });
    const res = await request(appWith(chain))
      .post(PATH)
      .send({ account: SEPTIC });
    expect(res.status).toBe(503);
    expect(res.body.message).toContain("no transaction was built");
  });

  it("refuses every deal but the rehearsal deal", async () => {
    const res = await request(appWith(fakeChain()))
      .post(`/api/actions/approve/${stagedReleasedDeal.id}`)
      .send({ account: SEPTIC });
    expect(res.status).toBe(404);
  });
});
