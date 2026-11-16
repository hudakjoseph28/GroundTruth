import {
  CHECK_KINDS,
  stagedDeal,
  type Check,
  type CheckKind,
  type Deal,
  type DealState,
  type ParcelReport,
  type ReviewerRole,
} from "@groundtruth/shared";
import { CHAIN_FINDINGS, ESCROW } from "../content/parcel";
import { getParcelReport } from "./parcelSource";
import { stagedLedger, type Reference } from "./stagedLedger";

// The parcel ledger's view model. It reads the report and the deal, in that
// order of trust: confirmed state on the deal wins, then the report, then the
// staged demo layer. Signatures only ever come from the report or the deal.

export type StepState = "done" | "current" | "todo";

export interface LedgerRecord {
  check: Check;
  /** True when the check comes from the demo layer, not a report or the chain. */
  staged: boolean;
  references: readonly Reference[];
  /** The deal reviewer whose approval settles this check, when there is one. */
  role?: ReviewerRole;
  signerWallet?: string;
  signature?: string;
  /** Evidence, review, on-chain. */
  steps: readonly [StepState, StepState, StepState];
}

export type VerdictTone = "held" | "pending" | "released" | "quiet";

export interface EscrowSummary {
  dealId: string;
  /** True while the state shown is the demo layer's, not the deal's. */
  staged: boolean;
  /** Whole and fractional token units, for example "25" or "25.5". */
  amount: string;
  state: DealState;
  signed: number;
  required: number;
  verdict: { tone: VerdictTone; text: string };
  escrowAddress?: string;
}

export interface ParcelLedger {
  staged: boolean;
  biggestOpenQuestion: CheckKind | null;
  records: readonly LedgerRecord[];
  escrow: EscrowSummary | null;
}

// A reviewer signs one scope (Problem.md): title covers seller authority,
// the surveyor the boundary, the septic reviewer wastewater.
const SCOPE: Record<ReviewerRole, CheckKind> = {
  title: "sellerAuthority",
  survey: "survey",
  septic: "septic",
};

const ROLE_FOR: Partial<Record<CheckKind, ReviewerRole>> = {
  sellerAuthority: "title",
  closing: "title",
  survey: "survey",
  septic: "septic",
};

const USDC_DECIMALS = 6;

/** "25000000" base units to "25"; keeps any fraction exactly. */
export function formatUsdc(baseUnits: string): string {
  const digits = baseUnits.padStart(USDC_DECIMALS + 1, "0");
  const whole = digits.slice(0, -USDC_DECIMALS).replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(-USDC_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/** "66EpT1ZY…hLeN" style: enough to recognize, short enough to scan. */
export function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`;
}

/** How far a check has come: evidence, review, on-chain. */
export function stepsFor(check: Check, signature: string | undefined): LedgerRecord["steps"] {
  if (signature) return ["done", "done", "done"];
  switch (check.status) {
    case "unknown":
      return ["current", "todo", "todo"];
    case "evidenceFound":
      return ["done", "todo", "todo"];
    case "needsReview":
      return ["done", "current", "todo"];
    case "signedOff":
    case "held":
      return ["done", "done", "current"];
  }
}

function hasChainState(deal: Deal): boolean {
  return Boolean(
    deal.escrowAddress ||
      deal.hold ||
      deal.state !== "draft" ||
      deal.reviewers.some((reviewer) => reviewer.approvedAt),
  );
}

/** Confirmed chain state for a reviewer's scope overrides whatever the report or demo layer said. */
function chainCheck(check: Check, deal: Deal | null): { check: Check; signature?: string } | null {
  if (!deal) return null;
  const role = ROLE_FOR[check.kind];
  if (!role || SCOPE[role] !== check.kind) return null;
  if (deal.hold && deal.hold.role === role) {
    return {
      check: {
        ...check,
        status: "held",
        finding: `${CHAIN_FINDINGS.held(role)} ${deal.hold.buyerMessage}`.trim(),
        limitation: CHAIN_FINDINGS.heldLimit,
        reviewerWallet: deal.hold.placedByWallet,
        transactionSignature: deal.hold.transactionSignature,
      },
      signature: deal.hold.transactionSignature,
    };
  }
  const reviewer = deal.reviewers.find((entry) => entry.role === role);
  if (reviewer?.approvedAt) {
    return {
      check: {
        ...check,
        status: "signedOff",
        finding: CHAIN_FINDINGS.signedOff(role),
        limitation: CHAIN_FINDINGS.signedLimit,
        reviewerWallet: reviewer.wallet,
        transactionSignature: reviewer.approvalTransaction,
      },
      signature: reviewer.approvalTransaction,
    };
  }
  return null;
}

function unknownCheck(kind: CheckKind): Check {
  return {
    kind,
    status: "unknown",
    finding: "No report includes this check yet.",
    limitation: "No conclusion is established either way.",
    sources: [],
    responsibleParty: { role: "Unassigned" },
    nextAction: "No next action is recorded.",
  };
}

function verdictFor(
  state: DealState,
  holdRole: ReviewerRole | undefined,
  waiting: number,
): EscrowSummary["verdict"] {
  if (state === "released") return { tone: "released", text: ESCROW.verdict.released };
  if (state === "refunded") return { tone: "quiet", text: ESCROW.verdict.refunded };
  if (state === "held") {
    return {
      tone: "held",
      text: holdRole ? ESCROW.verdict.held(holdRole) : ESCROW.verdict.heldUnknown,
    };
  }
  if (waiting > 0) return { tone: "pending", text: ESCROW.verdict.waiting(waiting) };
  return { tone: "pending", text: ESCROW.verdict.ready };
}

export function buildLedger(
  parcelKey: string,
  report: ParcelReport | null,
  deal: Deal | null,
): ParcelLedger {
  const demo = stagedLedger.parcelKey === parcelKey ? stagedLedger : null;
  const useDemoDeal = Boolean(demo && deal && !hasChainState(deal));

  const biggest = report?.biggestOpenQuestion ?? demo?.biggestOpenQuestion ?? null;
  const kinds = report || demo ? CHECK_KINDS : [];
  const ordered = biggest
    ? [biggest, ...kinds.filter((kind) => kind !== biggest)]
    : [...kinds];

  const records = ordered.map((kind): LedgerRecord => {
    const reported = report?.checks.find((entry) => entry.kind === kind);
    const demoCheck = reported ? undefined : demo?.checks.find((entry) => entry.kind === kind);
    const base = reported ?? demoCheck ?? unknownCheck(kind);
    const chain = chainCheck(base, deal);
    const check = chain?.check ?? base;
    const role = ROLE_FOR[kind];
    const reviewer = role ? deal?.reviewers.find((entry) => entry.role === role) : undefined;
    const signature = chain?.signature ?? check.transactionSignature;
    return {
      check,
      staged: Boolean(demoCheck) && !chain,
      references: demoCheck && !chain ? demoCheck.references : [],
      role,
      signerWallet: check.reviewerWallet ?? reviewer?.wallet,
      signature,
      steps: stepsFor(check, signature),
    };
  });

  let escrow: EscrowSummary | null = null;
  if (deal) {
    const required = deal.reviewers.filter((reviewer) => reviewer.required);
    const statusOf = (role: ReviewerRole) =>
      records.find((record) => record.check.kind === SCOPE[role])?.check.status;
    // The demo layer counts its own staged decisions; otherwise only the deal counts.
    const signed = required.filter((reviewer) =>
      useDemoDeal ? statusOf(reviewer.role) === "signedOff" : Boolean(reviewer.approvedAt),
    ).length;
    const holdRole = useDemoDeal
      ? required.find((reviewer) => statusOf(reviewer.role) === "held")?.role
      : deal.hold?.role;
    const state = useDemoDeal && demo ? demo.dealState : deal.state;
    escrow = {
      dealId: deal.id,
      staged: useDemoDeal,
      amount: formatUsdc(deal.amountBaseUnits),
      state,
      signed,
      required: required.length,
      verdict: verdictFor(state, holdRole, required.length - signed),
      escrowAddress: deal.escrowAddress,
    };
  }

  return {
    staged: records.some((record) => record.staged) || Boolean(escrow?.staged),
    biggestOpenQuestion: biggest,
    records,
    escrow,
  };
}

/** The ledger for a parcel, from the same seams the rest of the page reads. */
export function getParcelLedger(parcelKey: string): ParcelLedger {
  const deal: Deal | null = stagedDeal.parcelKey === parcelKey ? stagedDeal : null;
  return buildLedger(parcelKey, getParcelReport(parcelKey), deal);
}
