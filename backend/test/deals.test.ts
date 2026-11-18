import { stagedDeal } from "@groundtruth/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  StoredReviewer,
  StoredTimelineEvent,
} from "../src/deals/mapDeal.js";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("../src/db.js", () => ({
  prisma: { dealRecord: { findUnique } },
}));

const { createApp } = await import("../src/app.js");
const app = createApp("test-commit");

const DEAL_ID = stagedDeal.id;
const HOLD_TX = "5holdSignature1111111111111111111111111111111111111111111111";
const APPROVAL_TX =
  "4approvalSignature11111111111111111111111111111111111111111111";

function storedDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    parcelKey: stagedDeal.parcelKey,
    buyerWallet: stagedDeal.buyerWallet,
    sellerWallet: stagedDeal.sellerWallet,
    sellerTokenAccount: stagedDeal.sellerTokenAccount,
    amountBaseUnits: stagedDeal.amountBaseUnits,
    mint: stagedDeal.mint,
    cluster: "devnet",
    state: "draft",
    escrowAddress: stagedDeal.escrowAddress,
    publicDemo: true,
    reviewers: stagedDeal.reviewers.map(
      (reviewer, position): StoredReviewer => ({
        position,
        wallet: reviewer.wallet,
        role: reviewer.role,
        required: reviewer.required,
        approvedAt: null,
        approvalTransaction: null,
      }),
    ),
    hold: null,
    timelineEvents: <StoredTimelineEvent[]>[
      {
        id: "staged-devnet-deal-created",
        at: new Date(stagedDeal.timeline[0].at),
        type: "dealCreated",
        actorRole: "buyer",
        buyerMessage: "Staged devnet deal created. No funds have moved.",
        transactionSignature: null,
        confirmationStatus: "offChainEvidence",
      },
    ],
    ...overrides,
  };
}

const heldDealRow = () =>
  storedDeal({
    state: "held",
    hold: {
      placedByWallet: stagedDeal.reviewers[0]!.wallet,
      role: "title",
      reasonCode: "SELLER_IDENTITY_DISPUTED",
      buyerMessage: "The title reviewer paused payment.",
      transactionSignature: HOLD_TX,
      placedAt: new Date("2026-11-15T10:00:00.000Z"),
    },
  });

afterEach(() => {
  findUnique.mockReset();
  vi.restoreAllMocks();
});

describe.each([
  ["GET /api/deals/:id", (id: string) => `/api/deals/${id}`],
  ["GET /api/deals/:id/timeline", (id: string) => `/api/deals/${id}/timeline`],
])("%s access rules", (_label, url) => {
  it.each([
    ["too long", "a".repeat(65)],
    ["leading hyphen", "-deal"],
    ["dot segment", ".."],
    ["punctuation", "deal;drop"],
  ])("rejects a malformed ID (%s) without querying", async (_case, id) => {
    const res = await request(app).get(url(encodeURIComponent(id)));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown deal", async () => {
    findUnique.mockResolvedValue(null);

    const res = await request(app).get(url("no-such-deal"));

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("No public deal has this ID.");
  });

  it("answers a private deal exactly like a missing one", async () => {
    findUnique.mockResolvedValue(null);
    const missing = await request(app).get(url("private-deal"));
    findUnique.mockResolvedValue(storedDeal({ publicDemo: false }));
    const hidden = await request(app).get(url("private-deal"));

    expect(hidden.status).toBe(missing.status);
    expect(hidden.body.error.code).toBe(missing.body.error.code);
    expect(hidden.body.error.message).toBe(missing.body.error.message);
    expect(JSON.stringify(hidden.body)).not.toContain(stagedDeal.buyerWallet);
  });
});

describe("GET /api/deals/:id", () => {
  it("serves the staged deal in the v1 Deal shape", async () => {
    findUnique.mockResolvedValue(storedDeal());

    const res = await request(app).get(`/api/deals/${DEAL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(stagedDeal);
    expect(res.body).not.toHaveProperty("publicDemo");
  });

  it("orders reviewers by bound position and shows approvals", async () => {
    const row = storedDeal({ state: "funded" });
    row.reviewers.reverse();
    row.reviewers[0] = {
      ...row.reviewers[0]!,
      approvedAt: new Date("2026-11-15T09:00:00.000Z"),
      approvalTransaction: APPROVAL_TX,
    };
    findUnique.mockResolvedValue(row);

    const res = await request(app).get(`/api/deals/${DEAL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.reviewers.map((r: { role: string }) => r.role)).toEqual([
      "title",
      "survey",
      "septic",
    ]);
    expect(res.body.reviewers[2]).toMatchObject({
      role: "septic",
      approvedAt: "2026-11-15T09:00:00.000Z",
      approvalTransaction: APPROVAL_TX,
    });
  });

  it("includes the hold on a held deal", async () => {
    findUnique.mockResolvedValue(heldDealRow());

    const res = await request(app).get(`/api/deals/${DEAL_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("held");
    expect(res.body.hold).toEqual({
      placedByWallet: stagedDeal.reviewers[0]!.wallet,
      role: "title",
      reasonCode: "SELLER_IDENTITY_DISPUTED",
      buyerMessage: "The title reviewer paused payment.",
      transactionSignature: HOLD_TX,
      placedAt: "2026-11-15T10:00:00.000Z",
    });
  });

  it("asks the database for timeline rows in contract order", async () => {
    findUnique.mockResolvedValue(storedDeal());

    await request(app).get(`/api/deals/${DEAL_ID}`);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEAL_ID },
        include: expect.objectContaining({
          timelineEvents: {
            orderBy: [
              { at: "asc" },
              { slot: { sort: "asc", nulls: "last" } },
              { eventIndex: { sort: "asc", nulls: "last" } },
              { id: "asc" },
            ],
          },
        }),
      }),
    );
  });

  it.each([
    ["unknown state", { state: "settled" }],
    ["held without a hold", { state: "held", hold: null }],
    ["mainnet cluster", { cluster: "mainnet-beta" }],
    [
      "different mint",
      { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    ],
    ["fractional amount", { amountBaseUnits: "25.5" }],
  ])(
    "refuses to serve stored data outside the contract (%s)",
    async (_case, overrides) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      findUnique.mockResolvedValue(storedDeal(overrides));

      const res = await request(app).get(`/api/deals/${DEAL_ID}`);

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
    },
  );

  it("refuses a confirmed event without a transaction signature", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const row = storedDeal();
    row.timelineEvents[0] = {
      ...row.timelineEvents[0]!,
      confirmationStatus: "confirmed",
    };
    findUnique.mockResolvedValue(row);

    const res = await request(app).get(`/api/deals/${DEAL_ID}`);

    expect(res.status).toBe(500);
  });

  it("refuses an approval that has a time but no transaction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const row = storedDeal({ state: "funded" });
    row.reviewers[0] = {
      ...row.reviewers[0]!,
      approvedAt: new Date("2026-11-15T09:00:00.000Z"),
    };
    findUnique.mockResolvedValue(row);

    const res = await request(app).get(`/api/deals/${DEAL_ID}`);

    expect(res.status).toBe(500);
  });
});

describe("GET /api/deals/:id/timeline", () => {
  it("returns only the timeline array", async () => {
    findUnique.mockResolvedValue(heldDealRow());

    const res = await request(app).get(`/api/deals/${DEAL_ID}/timeline`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(stagedDeal.timeline);
  });
});
