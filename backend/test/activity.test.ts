import { stagedLiveDeal } from "@groundtruth/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredActivityRow } from "../src/deals/mapDeal.js";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("../src/db.js", () => ({
  prisma: { timelineEventRecord: { findMany } },
}));

const { createApp } = await import("../src/app.js");
const app = createApp("test-commit");

const APPROVAL_TX =
  "4approvalSignature11111111111111111111111111111111111111111111";
const FUND_TX = "3fundSignature1111111111111111111111111111111111111111111111";

function row(overrides: Partial<StoredActivityRow> = {}): StoredActivityRow {
  return {
    id: `${APPROVAL_TX}:0`,
    at: new Date("2026-11-18T18:57:23.000Z"),
    type: "approvalSigned",
    actorRole: "septic",
    buyerMessage: "The septic reviewer signed their approval.",
    transactionSignature: APPROVAL_TX,
    confirmationStatus: "confirmed",
    deal: { id: stagedLiveDeal.id, amountBaseUnits: "10000000" },
    ...overrides,
  };
}

afterEach(() => {
  findMany.mockReset();
  vi.restoreAllMocks();
});

describe("GET /api/activity", () => {
  it("serves confirmed program events in the ActivityEvent shape", async () => {
    findMany.mockResolvedValue([
      row(),
      row({
        id: `${FUND_TX}:0`,
        at: new Date("2026-11-18T18:57:20.000Z"),
        type: "funded",
        actorRole: "buyer",
        buyerMessage: "The buyer deposited 10 test USDC into escrow.",
        transactionSignature: FUND_TX,
      }),
    ]);

    const res = await request(app).get("/api/activity");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual([
      {
        id: `${APPROVAL_TX}:0`,
        dealId: stagedLiveDeal.id,
        dealAmountBaseUnits: "10000000",
        at: "2026-11-18T18:57:23.000Z",
        type: "approvalSigned",
        actorRole: "septic",
        buyerMessage: "The septic reviewer signed their approval.",
        transactionSignature: APPROVAL_TX,
        confirmationStatus: "confirmed",
      },
      {
        id: `${FUND_TX}:0`,
        dealId: stagedLiveDeal.id,
        dealAmountBaseUnits: "10000000",
        at: "2026-11-18T18:57:20.000Z",
        type: "funded",
        actorRole: "buyer",
        buyerMessage: "The buyer deposited 10 test USDC into escrow.",
        transactionSignature: FUND_TX,
        confirmationStatus: "confirmed",
      },
    ]);
  });

  it("asks only for the newest 8 confirmed rows on public demo deals", async () => {
    findMany.mockResolvedValue([]);

    await request(app).get("/api/activity");

    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0]![0];
    expect(query.where).toEqual({
      confirmationStatus: "confirmed",
      transactionSignature: { not: null },
      deal: { publicDemo: true },
    });
    expect(query.take).toBe(8);
    expect(query.orderBy).toEqual([
      { at: "desc" },
      { slot: { sort: "desc", nulls: "last" } },
      { eventIndex: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ]);
    // Only the deal's public fields are read: no wallets, no publicDemo flag.
    expect(query.select.deal).toEqual({
      select: { id: true, amountBaseUnits: true },
    });
  });

  it("answers an empty list when nothing is confirmed yet", async () => {
    findMany.mockResolvedValue([]);

    const res = await request(app).get("/api/activity");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([
    [
      "an off-chain row",
      row({
        confirmationStatus: "offChainEvidence",
        transactionSignature: null,
      }),
    ],
    [
      "a confirmed row with no transaction",
      row({ transactionSignature: null }),
    ],
    ["a type outside the contract", row({ type: "teleported" })],
    [
      "an amount that is not base units",
      row({ deal: { id: "d", amountBaseUnits: "10.5" } }),
    ],
  ])("fails closed on %s instead of showing it", async (_case, bad) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findMany.mockResolvedValue([row(), bad]);

    const res = await request(app).get("/api/activity");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain(APPROVAL_TX);
  });
});
