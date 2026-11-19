import { GROUNDTRUTH_PROGRAM_ID, stagedDeal } from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import devpost from "../../../../docs/phases/04-pitch/Devpost.md?raw";
import qaProof from "../../../../docs/phases/04-pitch/QA-Proof.md?raw";
import {
  ELEVENLABS,
  ELEVENLABS_CONVERSATION,
  HELD,
  PARCEL,
  PROGRAM,
  PROOF_DEALS,
  PROOF_DOCS,
  QUICKNODE,
  RELEASED,
  type Claim,
} from "./proof";

// /proof may not say anything the proof docs do not. These tests hold every
// link and quoted value on the page to Devpost.md and QA-Proof.md, so an edit
// to either side that drifts fails here.

const docs = `${devpost}\n${qaProof}`;

/** Links that point at the docs themselves or at this site. */
function isSelfReference(href: string): boolean {
  return (
    href.startsWith("/") ||
    Object.values(PROOF_DOCS).some((doc) => doc.href === href)
  );
}

const allClaims: readonly Claim[] = [
  ...PROGRAM.claims,
  ...HELD.claims,
  ...RELEASED.claims,
  ...QUICKNODE.claims,
  ...ELEVENLABS.claims,
  ...PARCEL.claims,
];

describe("/proof content", () => {
  it("links only to evidence the proof docs already cite", () => {
    const external = allClaims
      .flatMap((claim) => claim.evidence)
      .filter((link) => !isSelfReference(link.href));
    expect(external.length).toBeGreaterThan(20);
    for (const link of external) {
      expect(docs, link.label).toContain(link.href);
    }
  });

  it("cites every Franklin source QA-Proof.md lists, in the same order", () => {
    const franklin = qaProof.slice(
      qaProof.indexOf("## Franklin County"),
      qaProof.indexOf("## Licking County"),
    );
    const bullets = franklin
      .split("\n")
      .filter((line) => line.startsWith("- **"));
    expect(PARCEL.claims).toHaveLength(bullets.length);
    PARCEL.claims.forEach((claim, index) => {
      for (const link of claim.evidence) {
        expect(bullets[index], claim.text).toContain(`<${link.href}>`);
      }
    });
  });

  it("matches Devpost.md's balance tables row for row", () => {
    for (const deal of [HELD, RELEASED]) {
      for (const row of deal.balances) {
        const line = devpost
          .split("\n")
          .find(
            (candidate) =>
              candidate.startsWith("|") &&
              candidate.includes(`/tx/${row.signatures[0]}?`),
          );
        expect(line, row.step).toBeDefined();
        for (const signature of row.signatures)
          expect(line).toContain(signature);
        expect(line).toMatch(
          new RegExp(
            `\\| ${row.buyer} \\| ${row.vault} \\| ${row.seller} \\|\\s*$`,
          ),
        );
      }
    }
  });

  it("quotes the numbers and log lines exactly as the docs record them", () => {
    for (const quoted of [
      GROUNDTRUTH_PROGRAM_ID,
      HELD.log,
      ELEVENLABS_CONVERSATION,
      `elevenlabs recorded ownerDeniesSale ${ELEVENLABS_CONVERSATION} deal=staged-devnet-deal`,
      "22:10:40 UTC",
      "22:10:54 UTC",
      "523727603–523727618",
      "1–2 s after its block (18:57:20–18:57:24 UTC)",
      "stamped 13:57:29 EST",
      "1.8–3.3 s",
      "replay:devnet",
      "Ko (Kokomo silty clay loam, 0–2% slopes) 46.05%",
      "CrB (Crosby silt loam, 2–6% slopes) 38.31%",
      "CeB2 (Celina silt loam, 2–6% slopes, eroded) 15.64%",
      "`Legal Acres 3.015`",
      "about 106 metres",
      "4.7%",
      "`39049C0290K` effective 2008-06-17",
      "`39097C0190E` effective 2023-11-16",
    ]) {
      expect(docs).toContain(quoted);
    }
  });

  it("checks each deal whose account the docs link, at that account", () => {
    expect(PROOF_DEALS.map((deal) => deal.dealId)).toEqual([
      stagedDeal.id,
      "staged-devnet-deal-released",
      "staged-devnet-deal-live",
    ]);
    for (const deal of PROOF_DEALS) {
      expect(devpost).toContain(
        `/address/${deal.escrowAddress}?cluster=devnet`,
      );
    }
  });

  it("keeps the ElevenLabs call marked as recorded after the hold", () => {
    expect(ELEVENLABS.after).toContain("after that deal's hold and refund");
    expect(devpost).toContain(
      "The call was recorded **after** that deal's hold and refund",
    );
  });
});
