import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "@groundtruth/shared";
import { timeAgo, toActivityRow } from "./activityRow";

const SIGNATURE =
  "2VSXvYoKQcaHxfK6V8zCFZE9imyBxE8ZF3b8RK7snsP57HxrWdpnYVWUT8puLoZ53bKzvoas2CyuvBUZeRGvsFPL";

const event = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: `${SIGNATURE}:0`,
  dealId: "staged-devnet-deal-live",
  dealAmountBaseUnits: "10000000",
  at: "2026-11-18T18:57:21.000Z",
  type: "approvalSigned",
  actorRole: "septic",
  buyerMessage: "The septic reviewer signed their approval.",
  transactionSignature: SIGNATURE,
  confirmationStatus: "confirmed",
  ...overrides,
});

describe("toActivityRow", () => {
  it("names the reviewer, the deal amount, and the Explorer transaction", () => {
    expect(toActivityRow(event())).toEqual({
      id: `${SIGNATURE}:0`,
      what: "Septic reviewer approved",
      deal: "10 test USDC deal",
      at: "2026-11-18T18:57:21.000Z",
      tone: "green",
      href: `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`,
    });
  });

  it.each([
    ["holdPlaced", "title", "Title reviewer placed a hold", "red"],
    ["releaseRejected", "escrow program", "Program blocked a release", "red"],
    ["released", "escrow program", "Escrow paid the seller", "green"],
    ["funded", "buyer", "Buyer funded the escrow", "gold"],
    ["refunded", "buyer", "Escrow refunded the buyer", "quiet"],
  ] as const)("describes %s by %s", (type, actorRole, what, tone) => {
    const row = toActivityRow(event({ type, actorRole }));
    expect(row.what).toBe(what);
    expect(row.tone).toBe(tone);
  });

  it("keeps fractional test USDC exact", () => {
    expect(toActivityRow(event({ dealAmountBaseUnits: "25500000" })).deal).toBe(
      "25.5 test USDC deal",
    );
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-18T19:00:00.000Z");
  it.each([
    ["2026-11-18T18:59:58.000Z", "just now"],
    ["2026-11-18T18:59:15.000Z", "45 s ago"],
    ["2026-11-18T18:57:21.000Z", "2 min ago"],
    ["2026-11-18T16:00:00.000Z", "3 h ago"],
    ["2026-11-15T19:00:00.000Z", "3 d ago"],
  ])("%s is %s", (iso, label) => {
    expect(timeAgo(iso, now)).toBe(label);
  });
});
