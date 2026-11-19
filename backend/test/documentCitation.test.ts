import { createHash } from "node:crypto";
import { stagedRehearsalV2Deal } from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import {
  toDeal,
  type StoredDeal,
  type StoredTimelineEvent,
} from "../src/deals/mapDeal.js";

const HASH = createHash("sha256").update("septic").digest("hex");
const UNKNOWN = createHash("sha256")
  .update("a file nobody uploaded")
  .digest("hex");
const TX = "4approvalSignature11111111111111111111111111111111111111111111";

function approval(citedDocumentSha256: string | null): StoredTimelineEvent {
  return {
    id: `${TX}:0`,
    at: new Date("2026-11-19T15:00:00.000Z"),
    type: "approvalSigned",
    actorRole: "septic",
    buyerMessage: "The septic reviewer signed their approval.",
    transactionSignature: TX,
    confirmationStatus: "confirmed",
    citedDocumentSha256,
  };
}

function stored(
  event: StoredTimelineEvent,
  documents: StoredDeal["documents"] = [],
): StoredDeal {
  const d = stagedRehearsalV2Deal;
  return {
    id: d.id,
    parcelKey: d.parcelKey,
    buyerWallet: d.buyerWallet,
    sellerWallet: d.sellerWallet,
    sellerTokenAccount: d.sellerTokenAccount,
    amountBaseUnits: d.amountBaseUnits,
    mint: d.mint,
    cluster: "devnet",
    state: "funded",
    escrowAddress: d.escrowAddress,
    reviewers: [],
    hold: null,
    timelineEvents: [event],
    documents,
  };
}

const septicDoc = {
  id: "0b8f7c2e-8d1e-4a8e-9c37-3f0d3c1c2b11",
  type: "septicSoilEvaluation",
  filename: "Septic evaluation.pdf",
  sha256: HASH,
  uploaderRole: "septic",
};

describe("approval timeline rows and document memos", () => {
  it("links an approval to the deal document whose hash the memo named", () => {
    const [row] = toDeal(stored(approval(HASH), [septicDoc])).timeline;
    expect(row?.citedDocument).toEqual({
      sha256: HASH,
      document: {
        id: septicDoc.id,
        type: "septicSoilEvaluation",
        filename: "Septic evaluation.pdf",
        uploaderRole: "septic",
      },
    });
    expect(row?.buyerMessage).toBe(
      "The septic reviewer signed their approval, relying on “Septic evaluation.pdf” (hash on-chain).",
    );
  });

  it("keeps the on-chain hash but links nothing when no document matches", () => {
    const [row] = toDeal(stored(approval(UNKNOWN), [septicDoc])).timeline;
    expect(row?.citedDocument).toEqual({ sha256: UNKNOWN });
    expect(row?.buyerMessage).toBe(
      `The septic reviewer signed their approval, citing document hash ${UNKNOWN.slice(0, 12)}… on-chain. No document on this deal has that hash.`,
    );
  });

  it("leaves an approval without a memo exactly as stored", () => {
    const [row] = toDeal(stored(approval(null), [septicDoc])).timeline;
    expect(row).not.toHaveProperty("citedDocument");
    expect(row?.buyerMessage).toBe(
      "The septic reviewer signed their approval.",
    );
  });
});
