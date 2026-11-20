import { describe, expect, it } from "vitest";
import {
  STAGED_REVIEWER_CREDENTIAL as CRED,
  stagedDeal,
} from "@groundtruth/shared";
import recorded from "./fixtures/attestations-devnet.json";
import { decodeBase64 } from "../verify/idlDecode";
import {
  attestationAddress,
  checkAttestation,
  credentialKey,
  readReviewerCredentials,
  type CredentialSubject,
} from "./readCredentials";

// The fixture is the three attestation accounts as devnet returned them
// (getMultipleAccounts, base64) right after
// `pnpm --filter @groundtruth/escrow sas:credentials issue`.
const accounts = recorded.accounts as Record<
  string,
  { owner: string; data: string }
>;
const reviewers: CredentialSubject[] = stagedDeal.reviewers.map(
  ({ wallet, role }) => ({ wallet, role }),
);
const NOW = () => new Date("2026-11-19T22:00:00Z");

function rpc(answer: (addresses: string[]) => unknown, status = 200) {
  const calls: string[][] = [];
  const fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params: [string[]];
    };
    expect(body.method).toBe("getMultipleAccounts");
    calls.push(body.params[0]);
    return new Response(JSON.stringify(answer(body.params[0])), { status });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const fromFixture = (addresses: string[]) => ({
  jsonrpc: "2.0",
  id: 1,
  result: {
    context: { slot: recorded.slot },
    value: addresses.map((a) =>
      accounts[a]
        ? { owner: accounts[a].owner, data: [accounts[a].data, "base64"] }
        : null,
    ),
  },
});

describe("reviewer credentials on SAS", () => {
  it("derives the recorded attestation address from each wallet", () => {
    for (const a of CRED.attestations)
      expect(attestationAddress(a.wallet)).toBe(a.address);
  });

  it("verifies all three staged reviewers from the recorded devnet accounts in one call", async () => {
    const { fetch, calls } = rpc(fromFixture);
    const reads = await readReviewerCredentials(reviewers, { fetch, now: NOW });
    expect(calls).toHaveLength(1);
    for (const r of reviewers) {
      const read = reads.get(credentialKey(r));
      expect(read).toMatchObject({
        status: "verified",
        role: r.role,
        staged: true,
        expiry: 0,
      });
      expect(read?.status === "verified" && read.issuer).toBe(CRED.issuerLabel);
    }
  });

  it("refuses a real attestation shown for the wrong role", () => {
    const title = CRED.attestations[0];
    const account = {
      owner: accounts[title.address]!.owner,
      data: decodeBase64(accounts[title.address]!.data),
    };
    expect(
      checkAttestation(
        { wallet: title.wallet, role: "septic" },
        title.address,
        account,
        0,
      ),
    ).toMatchObject({
      status: "invalid",
      reason: "Names the title role, not septic.",
    });
  });

  it("refuses an account another program owns, or bytes that are not an attestation", () => {
    const title = CRED.attestations[0];
    const data = decodeBase64(accounts[title.address]!.data);
    const subject = { wallet: title.wallet, role: "title" } as const;
    expect(
      checkAttestation(
        subject,
        title.address,
        { owner: "11111111111111111111111111111111", data },
        0,
      ).status,
    ).toBe("invalid");
    expect(
      checkAttestation(
        subject,
        title.address,
        { owner: CRED.programId, data: data.slice(0, 40) },
        0,
      ).status,
    ).toBe("invalid");
  });

  it("says none when no attestation exists for a wallet", async () => {
    const stranger = {
      wallet: "11111111111111111111111111111112",
      role: "title",
    } as const;
    const { fetch } = rpc(fromFixture);
    const reads = await readReviewerCredentials([stranger], {
      fetch,
      now: NOW,
    });
    expect(reads.get(credentialKey(stranger))?.status).toBe("none");
  });

  it("reports an RPC failure as not checked, never as missing", async () => {
    const { fetch } = rpc(() => ({}), 503);
    const reads = await readReviewerCredentials(reviewers, { fetch, now: NOW });
    for (const r of reviewers) {
      expect(reads.get(credentialKey(r))).toEqual({
        status: "error",
        message: "The devnet RPC answered HTTP 503.",
      });
    }
  });
});
