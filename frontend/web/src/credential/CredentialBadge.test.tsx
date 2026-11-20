import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  STAGED_REVIEWER_CREDENTIAL as CRED,
  stagedRehearsalV3Deal,
} from "@groundtruth/shared";
import { DealReviewers } from "../deal/DealParts";
import { viewDeal } from "../data/dealView";
import { credentialKey, type CredentialRead } from "./readCredentials";
import { CredentialBadge } from "./CredentialBadge";

const [title, survey, septic] = CRED.attestations;

function verified(a: (typeof CRED.attestations)[number]): CredentialRead {
  return {
    status: "verified",
    attestation: a.address,
    role: a.role,
    issuer: CRED.issuerLabel,
    staged: true,
    expiry: 0,
  };
}

describe("CredentialBadge", () => {
  it("links a verified credential to its attestation account on Explorer and labels it staged", () => {
    const reads = new Map([[credentialKey(title), verified(title)]]);
    const html = renderToStaticMarkup(
      <CredentialBadge reads={reads} wallet={title.wallet} role="title" />,
    );
    expect(html).toContain("✓ Credential on Solana");
    expect(html).toContain(
      `https://explorer.solana.com/address/${title.address}?cluster=devnet`,
    );
    expect(html).toContain("staged demo");
    expect(html).toContain("not a license");
  });

  it("never shows the check without a verified read", () => {
    const cases: [ReadonlyMap<string, CredentialRead> | "loading", string][] = [
      ["loading", "Checking credential…"],
      [
        new Map([
          [
            credentialKey(title),
            { status: "none", attestation: title.address },
          ],
        ]),
        "No credential on Solana",
      ],
      [
        new Map([
          [
            credentialKey(title),
            {
              status: "invalid",
              attestation: title.address,
              reason: "Expired.",
            },
          ],
        ]),
        "Credential did not check out",
      ],
      [
        new Map([
          [
            credentialKey(title),
            {
              status: "error",
              message: "The devnet RPC could not be reached.",
            },
          ],
        ]),
        "Credential not checked",
      ],
    ];
    for (const [reads, words] of cases) {
      const html = renderToStaticMarkup(
        <CredentialBadge reads={reads} wallet={title.wallet} role="title" />,
      );
      expect(html).toContain(words);
      expect(html).not.toContain("✓");
      expect(html).not.toContain("explorer.solana.com");
    }
  });

  it("shows one badge per reviewer on the deal page, and none without credentials", () => {
    const deal = viewDeal(stagedRehearsalV3Deal);
    const reads = new Map(
      [title, survey, septic].map((a) => [credentialKey(a), verified(a)]),
    );
    const withBadges = renderToStaticMarkup(
      <MemoryRouter>
        <DealReviewers deal={deal} credentials={reads} />
      </MemoryRouter>,
    );
    expect(withBadges.split("✓ Credential on Solana").length - 1).toBe(3);
    const without = renderToStaticMarkup(
      <MemoryRouter>
        <DealReviewers deal={deal} />
      </MemoryRouter>,
    );
    expect(without).not.toContain("Credential");
  });
});
