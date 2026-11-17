// Uses IDL-encoded test data (test/support/escrowLogs.ts), not devnet logs.
import { web3 } from "@anchor-lang/core";
import { describe, expect, it } from "vitest";
import {
  createEscrowDecoder,
  EscrowDecodeError,
} from "../src/chain/escrowDecoder.js";
import type { ConfirmedTransaction } from "../src/chain/programEvents.js";
import {
  AMOUNT,
  dealKeys,
  events,
  eventLine,
  heldReleaseLogs,
  invocation,
  OTHER_PROGRAM,
  PROGRAM,
  releaseAccounts,
} from "./support/escrowLogs.js";

const decode = createEscrowDecoder();
const k = dealKeys();
const e = events(k);
const dealPda = k.deal.toBase58();
const dealId = Buffer.from(k.dealId).toString("hex");

const tx = (
  logMessages: string[],
  extra: Partial<ConfirmedTransaction> = {},
): ConfirmedTransaction => ({
  signature: "5".repeat(88),
  slot: 1,
  blockTime: 1_794_700_800,
  logMessages,
  ...extra,
});

describe("escrow decoder: the six program events", () => {
  it("decodes every event the IDL defines into the API's shape", () => {
    const logs = invocation(PROGRAM, [
      e.init,
      e.fund,
      e.approve("Title"),
      e.approve("Survey"),
      e.approve("Septic"),
      e.hold(),
      e.release,
      e.refund,
    ]);

    expect(decode(tx(logs))).toEqual([
      { name: "DealInitialized", dealPda, dealId },
      { name: "DealFunded", dealPda, dealId, amountBaseUnits: AMOUNT },
      ...(["title", "survey", "septic"] as const).map((role) => ({
        name: "ApprovalSigned",
        dealPda,
        dealId,
        reviewerWallet: k.reviewers[role].toBase58(),
        role,
      })),
      {
        name: "HoldPlaced",
        dealPda,
        dealId,
        reviewerWallet: k.reviewers.title.toBase58(),
        role: "title",
        reasonCode: "SELLER_IDENTITY_DISPUTED",
      },
      {
        name: "DealReleased",
        dealPda,
        dealId,
        amountBaseUnits: AMOUNT,
        destinationTokenAccount: k.sellerTokenAccount.toBase58(),
      },
      {
        name: "DealRefunded",
        dealPda,
        dealId,
        amountBaseUnits: AMOUNT,
        destinationTokenAccount: k.buyerTokenAccount.toBase58(),
      },
    ]);
  });

  it.each([
    ["SellerIdentityDisputed", "SELLER_IDENTITY_DISPUTED"],
    ["TitleException", "TITLE_EXCEPTION"],
    ["SiteReviewFailed", "SITE_REVIEW_FAILED"],
    ["Other", "OTHER"],
  ])("maps HoldReason %s to %s", (variant, code) => {
    const [event] = decode(tx(invocation(PROGRAM, [e.hold(variant)])));
    expect(event).toMatchObject({ name: "HoldPlaced", reasonCode: code });
  });

  it("reads events the program logs inside a CPI from another program", () => {
    const logs = [
      `Program ${OTHER_PROGRAM} invoke [1]`,
      ...invocation(PROGRAM, [e.fund], 2),
      `Program ${OTHER_PROGRAM} success`,
    ];
    expect(decode(tx(logs)).map((event) => event.name)).toEqual(["DealFunded"]);
  });
});

describe("escrow decoder: only the GroundTruth program's own lines", () => {
  it("ignores a GroundTruth-shaped event logged by another program", () => {
    // A program that is not GroundTruth logs bytes that would decode as a
    // valid DealReleased paying someone else.
    const spoof = invocation(OTHER_PROGRAM, [e.release]);
    expect(decode(tx(spoof))).toEqual([]);
  });

  it("ignores another program's line after GroundTruth returns from a CPI", () => {
    const logs = [
      `Program ${OTHER_PROGRAM} invoke [1]`,
      ...invocation(PROGRAM, [e.fund], 2),
      e.release, // logged by OTHER_PROGRAM, after GroundTruth succeeded
      `Program ${OTHER_PROGRAM} success`,
    ];
    expect(decode(tx(logs)).map((event) => event.name)).toEqual(["DealFunded"]);
  });

  it("ignores lines logged by programs GroundTruth calls (the token program)", () => {
    const logs = [
      `Program ${PROGRAM} invoke [1]`,
      ...invocation(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        [e.release],
        2,
      ),
      e.fund,
      `Program ${PROGRAM} success`,
    ];
    expect(decode(tx(logs)).map((event) => event.name)).toEqual(["DealFunded"]);
  });
});

describe("escrow decoder: unreadable data throws", () => {
  const throwsDecode = (logs: string[]) =>
    expect(() => decode(tx(logs))).toThrow(EscrowDecodeError);

  it("an unknown discriminator", () => {
    throwsDecode(
      invocation(PROGRAM, [
        `Program data: ${Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]).toString("base64")}`,
      ]),
    );
  });

  it("a truncated event", () => {
    const bytes = Buffer.from(
      e.release.slice("Program data: ".length),
      "base64",
    );
    throwsDecode(
      invocation(PROGRAM, [
        `Program data: ${bytes.subarray(0, 20).toString("base64")}`,
      ]),
    );
  });

  it("an event with extra bytes after it", () => {
    const bytes = Buffer.from(e.fund.slice("Program data: ".length), "base64");
    throwsDecode(
      invocation(PROGRAM, [
        `Program data: ${Buffer.concat([bytes, Buffer.from([0])]).toString("base64")}`,
      ]),
    );
  });

  it("an unbalanced invoke stack, or truncated logs", () => {
    throwsDecode([`Program ${PROGRAM} invoke [1]`, e.fund]);
    throwsDecode([
      ...invocation(PROGRAM, [e.fund]),
      `Program ${PROGRAM} success`,
    ]);
    throwsDecode([`Program ${PROGRAM} invoke [1]`, e.fund, "Log truncated"]);
  });

  it("an unknown enum variant", () => {
    expect(() =>
      eventLine("HoldPlaced", {
        deal: k.deal,
        deal_id: k.dealId,
        reviewer: k.reviewers.title,
        role: { Title: {} },
        reason_code: { NotAReason: {} },
      }),
    ).toThrow();
  });
});

describe("escrow decoder: a failed release", () => {
  const payer = web3.Keypair.generate().publicKey;
  const accounts = releaseAccounts(k, payer);

  it("becomes one ReleaseRejected with the program's error from the logs", () => {
    expect(
      decode(
        tx(heldReleaseLogs(), {
          err: { InstructionError: [0, { Custom: 6019 }] },
          releaseAccounts: accounts,
        }),
      ),
    ).toEqual([
      {
        name: "ReleaseRejected",
        dealPda,
        errorName: "DealHeld",
        errorNumber: 6019,
      },
    ]);
  });

  it("names the error from the IDL when the logs carry no Anchor error line", () => {
    const logs = invocation(
      PROGRAM,
      ["Program log: Instruction: Release"],
      1,
      "custom program error: 0x1782",
    );
    expect(
      decode(
        tx(logs, {
          err: { InstructionError: [0, { Custom: 6018 }] },
          releaseAccounts: accounts,
        }),
      ),
    ).toEqual([
      {
        name: "ReleaseRejected",
        dealPda,
        errorName: "MissingRequiredApprovals",
        errorNumber: 6018,
      },
    ]);
  });

  it("never applies events a failed transaction logged (they were rolled back)", () => {
    const logs = invocation(
      PROGRAM,
      [e.release, "Program log: something failed after emit"],
      1,
      "custom program error: 0x1783",
    );
    const decoded = decode(
      tx(logs, {
        err: { InstructionError: [0, { Custom: 6019 }] },
        releaseAccounts: accounts,
      }),
    );
    expect(decoded.map((event) => event.name)).toEqual(["ReleaseRejected"]);
  });

  it("ignores an error line another program logged", () => {
    const logs = [
      ...invocation(OTHER_PROGRAM, [
        "Program log: AnchorError thrown in x.rs:1. Error Code: Fake. Error Number: 6001. Error Message: no.",
      ]),
      ...heldReleaseLogs(),
    ];
    const [event] = decode(
      tx(logs, {
        err: { InstructionError: [1, { Custom: 6019 }] },
        releaseAccounts: accounts,
      }),
    );
    expect(event).toMatchObject({ errorName: "DealHeld", errorNumber: 6019 });
  });

  it("throws when the logs and the transaction error disagree, or GroundTruth never ran", () => {
    expect(() =>
      decode(
        tx(heldReleaseLogs(), {
          err: { InstructionError: [0, { Custom: 6018 }] },
          releaseAccounts: accounts,
        }),
      ),
    ).toThrow(EscrowDecodeError);
    expect(() =>
      decode(
        tx(invocation(OTHER_PROGRAM, []), {
          err: { InstructionError: [0, { Custom: 1 }] },
          releaseAccounts: accounts,
        }),
      ),
    ).toThrow(EscrowDecodeError);
  });
});
