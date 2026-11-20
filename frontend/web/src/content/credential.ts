import type { ReviewerRole } from "@groundtruth/shared";
import { ROLE_LABELS } from "./deal";

// The reviewer credential badge: a staged Solana Attestation Service
// credential, read from devnet in the browser.
export const CREDENTIAL = {
  verified: "✓ Credential on Solana",
  staged: "staged demo",
  checking: "Checking credential…",
  none: "No credential on Solana",
  invalid: "Credential did not check out",
  error: "Credential not checked",
  title: (role: ReviewerRole, issuer: string) =>
    `Solana Attestation Service, devnet: ${ROLE_LABELS[role].toLowerCase()} reviewer. Issuer: ${issuer}. A staged test credential, not a license. Opens the attestation account on Solana Explorer.`,
  newTab: "opens in a new tab",
} as const;
