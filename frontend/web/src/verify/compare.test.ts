import { describe, expect, it } from "vitest";
import {
  GROUNDTRUTH_PROGRAM_ID,
  stagedDeal,
  stagedLiveDeal,
  stagedReleasedDeal,
  type Deal,
} from "@groundtruth/shared";
import { compareDeal, type FieldCheck } from "./compare";
import { decodeBase64 } from "./idlDecode";
import { readDealFromChain, type ChainRead, type ChainSnapshot } from "./readChain";
import {
  HELD_DEAL,
  LIVE_DEAL,
  LIVE_VAULT,
  RELEASED_DEAL,
  type CapturedAccount,
} from "./fixtures/devnetAccounts";

// The three demo deals as the API served them on 2026-11-19 (GET
// /api/deals/:id): the shared fixtures plus the state, approvals, and hold the
// API projected from confirmed chain events.
const TITLE = stagedDeal.reviewers[0].wallet;

const heldApp: Deal = {
  ...stagedDeal,
  reviewers: stagedDeal.reviewers.map((r) => ({ ...r })),
  state: "refunded",
  hold: {
    placedByWallet: TITLE,
    role: "title",
    reasonCode: "SELLER_IDENTITY_DISPUTED",
    buyerMessage:
      "The reviewer could not confirm that the seller is authorized to sell. Payment to the seller is blocked.",
    transactionSignature:
      "5QovFTbAMquUY5M5NpJwZPUJhtcKAcmQ5xmZhvFWT46KfPh3UBkaQMhgQhcuphBqvTiYLUgTmNNS7b8tyR7JJ2ib",
    placedAt: "2026-11-18T17:41:19.000Z",
  },
};

const approved = (at: string) => ({ approvedAt: at, approvalTransaction: "sig" });

const releasedApp: Deal = {
  ...stagedReleasedDeal,
  state: "released",
  reviewers: stagedReleasedDeal.reviewers.map((r) => ({
    ...r,
    ...approved("2026-11-18T17:48:43.000Z"),
  })),
};

const liveApp: Deal = {
  ...stagedLiveDeal,
  state: "funded",
  reviewers: stagedLiveDeal.reviewers.map((r) =>
    r.role === "septic" ? { ...r } : { ...r, ...approved("2026-11-18T18:57:21.000Z") },
  ),
};

type Accounts = Record<string, CapturedAccount | null>;

/** A JSON-RPC `getAccountInfo` endpoint serving captured accounts. */
function fakeRpc(accounts: Accounts, calls: unknown[] = []): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { params: [string, object] };
    calls.push(body.params);
    const account = accounts[body.params[0]] ?? null;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          context: { slot: 523859359 },
          value: account && {
            owner: account.owner,
            data: [account.base64, "base64"],
            lamports: 1,
            executable: false,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

async function snapshotOf(deal: CapturedAccount, accounts: Accounts = {}): Promise<ChainSnapshot> {
  const read = await readDealFromChain(deal.address, {
    fetch: fakeRpc({ [deal.address]: deal, ...accounts }),
    now: () => new Date("2026-11-19T03:45:00.000Z"),
  });
  if (read.status !== "read") throw new Error(`expected a read, got ${read.status}`);
  return read.snapshot;
}

function row(checks: readonly FieldCheck[], id: string): FieldCheck {
  const found = checks.find((check) => check.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
}

const FIELDS = [
  "address",
  "state",
  "amount",
  "mint",
  "buyer",
  "seller",
  "payout",
  "reviewer-title-0",
  "reviewer-survey-0",
  "reviewer-septic-0",
  "hold",
  "vault",
];

describe("compareDeal on the three demo deals", () => {
  it("matches the held deal: refunded, title hold, vault closed", async () => {
    const result = compareDeal(heldApp, await snapshotOf(HELD_DEAL));

    expect(result.checks.map((check) => check.id)).toEqual(FIELDS);
    expect(result.mismatches).toEqual([]);
    expect(result.matches).toBe(true);
    expect(row(result.checks, "hold").chain).toEqual({
      text: "Title · Seller identity disputed · 2026-11-18 17:41:19 UTC",
      address: TITLE,
    });
    expect(row(result.checks, "vault").chain.text).toBe(
      "0 test USDC · account closed when emptied",
    );
  });

  it("matches the released deal: three approvals, no hold, vault closed", async () => {
    const result = compareDeal(releasedApp, await snapshotOf(RELEASED_DEAL));

    expect(result.mismatches).toEqual([]);
    expect(row(result.checks, "reviewer-septic-0").chain.text).toBe("Approved");
    expect(row(result.checks, "hold").chain.text).toBe("No hold");
  });

  it("matches the live deal: funded, 10 test USDC in an open vault", async () => {
    const result = compareDeal(
      liveApp,
      await snapshotOf(LIVE_DEAL, { [LIVE_VAULT.address]: LIVE_VAULT }),
    );

    expect(result.mismatches).toEqual([]);
    expect(row(result.checks, "vault")).toMatchObject({
      chain: { text: "10 test USDC" },
      app: { text: "10 test USDC in escrow" },
      match: true,
    });
    expect(row(result.checks, "reviewer-septic-0").chain.text).toBe("Not approved");
    expect(row(result.checks, "address").chain.address).toBe(LIVE_DEAL.address);
  });
});

describe("compareDeal reports each difference", () => {
  it("flags an app that is behind the chain", async () => {
    const snapshot = await snapshotOf(RELEASED_DEAL);
    const stale: Deal = {
      ...releasedApp,
      state: "funded",
      reviewers: releasedApp.reviewers.map((r) =>
        r.role === "septic" ? { wallet: r.wallet, role: r.role, required: r.required } : r,
      ),
    };
    const result = compareDeal(stale, snapshot);

    expect(result.matches).toBe(false);
    expect(result.mismatches.map((check) => check.id)).toEqual([
      "state",
      "reviewer-septic-0",
      // The app says 25 should still be in escrow; the chain closed the vault.
      "vault",
    ]);
    expect(row(result.checks, "state")).toMatchObject({
      chain: { text: "Released" },
      app: { text: "Funded" },
    });
    expect(row(result.checks, "vault").note).toBe(
      "The vault was closed while the deal still holds funds.",
    );
  });

  it("flags a different amount, seller, mint, and payout account", async () => {
    const other = "11111111111111111111111111111111";
    const result = compareDeal(
      {
        ...releasedApp,
        amountBaseUnits: "25000001",
        sellerWallet: other,
        sellerTokenAccount: other,
        buyerWallet: other,
      },
      await snapshotOf(RELEASED_DEAL),
    );

    expect(result.mismatches.map((check) => check.id)).toEqual([
      "amount",
      "buyer",
      "seller",
      "payout",
    ]);
    expect(row(result.checks, "amount").app.text).toBe("25.000001 test USDC");
  });

  it("flags an escrow address that is not the deal's PDA", async () => {
    const result = compareDeal(
      { ...releasedApp, escrowAddress: HELD_DEAL.address },
      await snapshotOf(RELEASED_DEAL),
    );
    expect(result.mismatches.map((check) => check.id)).toEqual(["address"]);
  });

  it("flags a hold the app is missing, and one it has that the chain does not", async () => {
    const missing = compareDeal(
      { ...heldApp, hold: undefined },
      await snapshotOf(HELD_DEAL),
    );
    expect(missing.mismatches.map((check) => check.id)).toEqual(["hold"]);
    expect(row(missing.checks, "hold").app.text).toBe("No hold");

    const extra = compareDeal(
      { ...releasedApp, hold: heldApp.hold },
      await snapshotOf(RELEASED_DEAL),
    );
    expect(extra.mismatches.map((check) => check.id)).toEqual(["hold"]);
  });

  it("flags a hold with a different reason or time", async () => {
    const snapshot = await snapshotOf(HELD_DEAL);
    const reason = compareDeal(
      { ...heldApp, hold: { ...heldApp.hold!, reasonCode: "TITLE_EXCEPTION" } },
      snapshot,
    );
    expect(reason.mismatches.map((check) => check.id)).toEqual(["hold"]);

    const time = compareDeal(
      { ...heldApp, hold: { ...heldApp.hold!, placedAt: "2026-11-18T17:45:00.000Z" } },
      snapshot,
    );
    expect(row(time.checks, "hold")).toMatchObject({
      match: false,
      note: "The hold's time differs.",
    });
  });

  it("flags a reviewer seat held by another wallet or missing from the app", async () => {
    const snapshot = await snapshotOf(LIVE_DEAL, { [LIVE_VAULT.address]: LIVE_VAULT });
    const swapped = compareDeal(
      {
        ...liveApp,
        reviewers: liveApp.reviewers.map((r) =>
          r.role === "survey" ? { ...r, wallet: TITLE } : r,
        ),
      },
      snapshot,
    );
    expect(row(swapped.checks, "reviewer-survey-0")).toMatchObject({
      match: false,
      note: "A different wallet holds this role on-chain.",
    });

    const dropped = compareDeal(
      { ...liveApp, reviewers: liveApp.reviewers.filter((r) => r.role !== "septic") },
      snapshot,
    );
    expect(row(dropped.checks, "reviewer-septic-0")).toMatchObject({
      app: { text: "Not assigned" },
      match: false,
    });
  });

  it("flags a vault short of the deal amount", async () => {
    const short = vaultWith({ amount: 9_999_999n });
    const result = compareDeal(
      liveApp,
      await snapshotOf(LIVE_DEAL, { [LIVE_VAULT.address]: short }),
    );
    expect(result.mismatches.map((check) => check.id)).toEqual(["vault"]);
    expect(row(result.checks, "vault").chain.text).toBe("9.999999 test USDC");
  });

  it("accepts a surplus someone sent to the vault, and says so", async () => {
    const result = compareDeal(
      liveApp,
      await snapshotOf(LIVE_DEAL, {
        [LIVE_VAULT.address]: vaultWith({ amount: 10_500_000n }),
      }),
    );
    expect(row(result.checks, "vault")).toMatchObject({
      match: true,
      note: "Includes 0.5 test USDC sent to the vault outside the deal; the program never pays it out.",
    });
  });

  it("flags a vault the deal PDA does not control", async () => {
    const result = compareDeal(
      liveApp,
      await snapshotOf(LIVE_DEAL, {
        [LIVE_VAULT.address]: vaultWith({ owner: TITLE }),
      }),
    );
    expect(row(result.checks, "vault")).toMatchObject({
      match: false,
      note: "The vault is not controlled by this deal's PDA.",
    });
  });
});

describe("readDealFromChain", () => {
  it("reads the deal account, then its vault at or after the same slot", async () => {
    const calls: unknown[] = [];
    const read = await readDealFromChain(LIVE_DEAL.address, {
      fetch: fakeRpc({ [LIVE_DEAL.address]: LIVE_DEAL, [LIVE_VAULT.address]: LIVE_VAULT }, calls),
    });

    expect(read.status).toBe("read");
    expect(calls).toEqual([
      [LIVE_DEAL.address, { encoding: "base64", commitment: "confirmed" }],
      [
        LIVE_VAULT.address,
        { encoding: "base64", commitment: "confirmed", minContextSlot: 523859359 },
      ],
    ]);
  });

  it("reports an address with no account", async () => {
    expect(await readDealFromChain(LIVE_DEAL.address, { fetch: fakeRpc({}) })).toEqual({
      status: "missing",
      address: LIVE_DEAL.address,
      slot: 523859359,
    } satisfies ChainRead);
  });

  it("refuses an account another program owns", async () => {
    const read = await readDealFromChain(LIVE_DEAL.address, {
      fetch: fakeRpc({ [LIVE_DEAL.address]: { ...LIVE_DEAL, owner: TITLE } }),
    });
    expect(read).toMatchObject({ status: "foreign", owner: TITLE });
  });

  it("reports program-owned bytes that do not decode", async () => {
    const read = await readDealFromChain(LIVE_DEAL.address, {
      fetch: fakeRpc({ [LIVE_DEAL.address]: LIVE_VAULT_AS_PROGRAM }),
    });
    expect(read).toMatchObject({ status: "undecodable" });
  });

  it("turns an RPC failure into an error, without throwing", async () => {
    const down = (async () => new Response("busy", { status: 503 })) as typeof fetch;
    expect(await readDealFromChain(LIVE_DEAL.address, { fetch: down })).toEqual({
      status: "error",
      message: "The devnet RPC answered HTTP 503.",
    });

    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await readDealFromChain(LIVE_DEAL.address, { fetch: offline })).toEqual({
      status: "error",
      message: "The devnet RPC could not be reached.",
    });
  });
});

/** The live vault's token bytes with a changed amount or owner. */
function vaultWith(change: { amount?: bigint; owner?: string }): CapturedAccount {
  const data = decodeBase64(LIVE_VAULT.base64);
  const view = new DataView(data.buffer);
  if (change.amount !== undefined) view.setBigUint64(64, change.amount, true);
  if (change.owner) data.set(base58Bytes(change.owner), 32);
  return { ...LIVE_VAULT, base64: btoa(String.fromCharCode(...data)) };
}

const LIVE_VAULT_AS_PROGRAM: CapturedAccount = {
  ...LIVE_VAULT,
  owner: GROUNDTRUTH_PROGRAM_ID,
};

function base58Bytes(address: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const char of address) value = value * 58n + BigInt(alphabet.indexOf(char));
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}
