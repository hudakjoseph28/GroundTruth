import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { GROUNDTRUTH_ESCROW_IDL, stagedDemoChainAccounts } from "@groundtruth/shared";
import { decodeDealAccount, decodeTokenAccount, hex } from "./dealAccount";
import {
  DecodeError,
  decodeBase64,
  decodeIdlAccount,
  encodeBase58,
  type DecodableIdl,
} from "./idlDecode";
import {
  HELD_DEAL,
  LIVE_DEAL,
  LIVE_VAULT,
  RELEASED_DEAL,
} from "./fixtures/devnetAccounts";

const TITLE = "ExxnTPx24fjXRiAPcnrWqKCfEQDhDmxCDZ57VQ7RkBRW";
const SURVEY = "CT6Nstaijac7yAVuDNVWQ12JFMYGfggE4VPBK4sYohDa";
const SEPTIC = "Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F";

function bytesOf(account: { base64: string }): Uint8Array {
  return decodeBase64(account.base64);
}

describe("decodeDealAccount on real devnet bytes", () => {
  it("decodes the held deal: refunded, hold still recorded, nobody approved", () => {
    const deal = decodeDealAccount(bytesOf(HELD_DEAL));

    expect(deal.state).toBe("refunded");
    expect(deal.amountBaseUnits).toBe("25000000");
    expect(deal.buyer).toBe("HEDe3DMbVbFRku2Kzxq6usSjUdDJ1vphohTBxAXqEtXJ");
    expect(deal.seller).toBe("6XPGX3Vmqh4gtj6UZNcgJTDN1haWivctw8KQ7D6UpMMj");
    expect(deal.sellerTokenAccount).toBe(
      "CZQyg2JGyjj9vRyvaBYS2tz54kproMxoiNF9hHxTG5Zu",
    );
    expect(deal.mint).toBe("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    expect(deal.vault).toBe(stagedDemoChainAccounts["staged-devnet-deal"].vault);
    expect(hex(deal.dealId)).toBe(
      stagedDemoChainAccounts["staged-devnet-deal"].dealIdHex,
    );
    expect(deal.reviewers).toEqual([
      { wallet: TITLE, role: "title", required: true, approved: false },
      { wallet: SURVEY, role: "survey", required: true, approved: false },
      { wallet: SEPTIC, role: "septic", required: true, approved: false },
    ]);
    expect(deal.hold).toEqual({
      placedBy: TITLE,
      role: "title",
      reasonCode: "SELLER_IDENTITY_DISPUTED",
      // 2026-11-18T17:41:19Z, the hold transaction's block time.
      placedAtUnix: 1795023679n,
    });
    expect(deal.bump).toBe(254);
  });

  it("decodes the released deal: all three approved, no hold", () => {
    const deal = decodeDealAccount(bytesOf(RELEASED_DEAL));

    expect(deal.state).toBe("released");
    expect(deal.amountBaseUnits).toBe("25000000");
    expect(deal.reviewers.map((r) => [r.role, r.approved])).toEqual([
      ["title", true],
      ["survey", true],
      ["septic", true],
    ]);
    expect(deal.hold).toBeNull();
    expect(deal.vault).toBe(
      stagedDemoChainAccounts["staged-devnet-deal-released"].vault,
    );
  });

  it("decodes the live deal: funded, septic still waiting", () => {
    const deal = decodeDealAccount(bytesOf(LIVE_DEAL));

    expect(deal.state).toBe("funded");
    expect(deal.amountBaseUnits).toBe("10000000");
    expect(deal.reviewers.map((r) => [r.role, r.approved])).toEqual([
      ["title", true],
      ["survey", true],
      ["septic", false],
    ]);
    expect(deal.hold).toBeNull();
    expect(deal.vault).toBe(stagedDemoChainAccounts["staged-devnet-deal-live"].vault);
  });

  it("rejects bytes that are not a DealAccount", () => {
    const wrong = bytesOf(LIVE_DEAL);
    wrong[0] ^= 0xff;
    expect(() => decodeDealAccount(wrong)).toThrow(DecodeError);
    expect(() => decodeDealAccount(wrong)).toThrow("not a DealAccount");
  });

  it("rejects an account that ends inside the struct", () => {
    const short = bytesOf(LIVE_DEAL).slice(0, 8 + 32 + 32 + 10);
    expect(() => decodeDealAccount(short)).toThrow("ends early");
    expect(() => decodeDealAccount(new Uint8Array(4))).toThrow("too short");
  });

  it("rejects a state the IDL does not define", () => {
    const data = bytesOf(LIVE_DEAL);
    // discriminator, deal_id, buyer, seller, seller_token_account, mint, vault, amount
    const stateOffset = 8 + 32 * 6 + 8;
    expect(data[stateOffset]).toBe(1); // Funded
    data[stateOffset] = 9;
    expect(() => decodeDealAccount(data)).toThrow("DealState has no variant 9");
  });

  it("rejects an option tag other than 0 or 1", () => {
    const data = bytesOf(RELEASED_DEAL);
    // ... state, vec length (u32), three 35-byte reviewers, then hold's tag.
    const holdTag = 8 + 32 * 6 + 8 + 1 + 4 + 3 * 35;
    expect(data[holdTag]).toBe(0);
    data[holdTag] = 2;
    expect(() => decodeDealAccount(data)).toThrow("option has tag 2");
  });

  it("uses the discriminator from the checked-in IDL", () => {
    const account = GROUNDTRUTH_ESCROW_IDL.accounts.find(
      (entry) => entry.name === "DealAccount",
    )!;
    expect([...bytesOf(HELD_DEAL).slice(0, 8)]).toEqual(account.discriminator);
  });
});

describe("decodeTokenAccount", () => {
  it("reads the live vault: deal mint, deal PDA as owner, 10 test USDC", () => {
    expect(decodeTokenAccount(bytesOf(LIVE_VAULT))).toEqual({
      mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      owner: LIVE_DEAL.address,
      amount: "10000000",
    });
  });

  it("rejects data that is not 165 bytes", () => {
    expect(() => decodeTokenAccount(new Uint8Array(100))).toThrow(DecodeError);
  });
});

describe("decodeIdlAccount", () => {
  const idl: DecodableIdl = {
    accounts: [{ name: "Sample", discriminator: [1, 2, 3, 4, 5, 6, 7, 8] }],
    types: [
      {
        name: "Sample",
        type: {
          kind: "struct",
          fields: [
            { name: "small", type: "u16" },
            { name: "signed", type: "i64" },
            { name: "pair", type: { array: ["bool", 2] } },
            { name: "items", type: { vec: { defined: { name: "Item" } } } },
            { name: "maybe", type: { option: "u32" } },
            { name: "none", type: { option: "u8" } },
          ],
        },
      } as DecodableIdl["types"][number],
      {
        name: "Item",
        type: {
          kind: "struct",
          fields: [{ name: "color", type: { defined: { name: "Color" } } }],
        },
      } as DecodableIdl["types"][number],
      {
        name: "Color",
        type: { kind: "enum", variants: [{ name: "Red" }, { name: "Blue" }] },
      } as DecodableIdl["types"][number],
    ],
  };

  it("walks structs, enums, arrays, vecs, and options from the IDL", () => {
    const data = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, // discriminator
      0x34, 0x12, // u16 0x1234
      0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, // i64 -2
      1, 0, // [true, false]
      2, 0, 0, 0, 1, 0, // vec of two Items: Blue, Red
      1, 0x2a, 0, 0, 0, // Some(42)
      0, // None
      0xaa, 0xbb, // unused tail of the allocation
    ]);
    expect(decodeIdlAccount(idl, "Sample", data)).toEqual({
      small: 0x1234,
      signed: -2n,
      pair: [true, false],
      items: [{ color: "Blue" }, { color: "Red" }],
      maybe: 42,
      none: null,
    });
  });

  it("refuses an account name the IDL does not have", () => {
    expect(() => decodeIdlAccount(idl, "Other", new Uint8Array(16))).toThrow(
      "no Other account",
    );
  });
});

describe("encodeBase58", () => {
  it("writes addresses the way web3.js does, leading zero bytes included", () => {
    const samples = [
      new Uint8Array(32),
      Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)),
      Uint8Array.from({ length: 32 }, (_, i) => (i < 3 ? 0 : (i * 37) % 256)),
      Uint8Array.from({ length: 32 }, () => 255),
      new PublicKey(LIVE_DEAL.address).toBytes(),
    ];
    for (const bytes of samples) {
      expect(encodeBase58(bytes)).toBe(new PublicKey(bytes).toBase58());
    }
  });
});
