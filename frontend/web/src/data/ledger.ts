import {
  CHECK_KINDS,
  type Check,
  type CheckKind,
  type Deal,
  type DealState,
  type ParcelReport,
  type ReviewerRole,
} from "@groundtruth/shared";
import { CHAIN_FINDINGS, ESCROW } from "../content/parcel";
import { stagedLedger, type Reference } from "./stagedLedger";

// The parcel ledger's view model. It reads the report and the deal, in that
// order of trust: confirmed state on the deal wins, then the report. The deal
// comes from the API (GET /api/deals/:id), never from a bundled fixture. The
// staged demo layer shows only while the API reports nothing on-chain for the
// deal. Signatures only ever come from the report or the deal.

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

/**
 * True once the API has projected something from the chain for this deal. An
 * escrow address alone is not chain state: it is known before the deal exists.
 */
export function hasChainState(deal: Deal): boolean {
  return Boolean(
    deal.hold ||
      deal.state !== "draft" ||
      deal.reviewers.some((reviewer) => reviewer.approvedAt) ||
      deal.timeline.some((event) => event.confirmationStatus === "confirmed"),
  );
}

const closed = (state: DealState) => state === "released" || state === "refunded";

/**
 * A reviewer's scope on a deal with chain state, before any decision of
 * theirs: nothing is claimed beyond "not signed". chainCheck() overrides it
 * when the deal carries their approval or hold.
 */
function undecidedCheck(kind: CheckKind, role: ReviewerRole, deal: Deal): Check {
  return {
    kind,
    status: "unknown",
    finding: CHAIN_FINDINGS.undecided(role, closed(deal.state)),
    limitation: CHAIN_FINDINGS.undecidedLimit,
    sources: [],
    responsibleParty: { role: CHAIN_FINDINGS.reviewer(role) },
    nextAction: closed(deal.state)
      ? CHAIN_FINDINGS.closedNext
      : CHAIN_FINDINGS.undecidedNext(role),
  };
}

/** The closing itself, read from the deal's state and its settling transaction. */
function closingCheck(deal: Deal, signed: number, required: number): Check {
  const settled = (type: "released" | "refunded") =>
    deal.timeline.find(
      (event) => event.type === type && event.confirmationStatus === "confirmed",
    )?.transactionSignature;
  const base = {
    kind: "closing" as const,
    sources: [],
    responsibleParty: { role: CHAIN_FINDINGS.program },
    limitation: CHAIN_FINDINGS.closingLimit,
  };
  switch (deal.state) {
    case "released":
      return {
        ...base,
        status: "signedOff",
        finding: CHAIN_FINDINGS.closing.released,
        nextAction: CHAIN_FINDINGS.closedNext,
        transactionSignature: settled("released"),
      };
    case "refunded":
      return {
        ...base,
        // The hold was never lifted; the deal ended under it.
        status: deal.hold ? "held" : "needsReview",
        finding: CHAIN_FINDINGS.closing.refunded(Boolean(deal.hold)),
        nextAction: CHAIN_FINDINGS.closedNext,
        transactionSignature: settled("refunded"),
      };
    case "held":
      return {
        ...base,
        status: "held",
        finding: CHAIN_FINDINGS.closing.held,
        nextAction: CHAIN_FINDINGS.closing.heldNext,
        transactionSignature: deal.hold?.transactionSignature,
      };
    default:
      return {
        ...base,
        status: "needsReview",
        finding: CHAIN_FINDINGS.closing.open(signed, required, deal.state === "funded"),
        nextAction:
          signed >= required
            ? CHAIN_FINDINGS.closing.readyNext
            : CHAIN_FINDINGS.closing.waitingNext,
      };
  }
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

/** A deal's escrow as the API reports it: nothing staged, nothing assumed. */
export function summarizeDeal(deal: Deal): EscrowSummary {
  const required = deal.reviewers.filter((reviewer) => reviewer.required);
  const signed = required.filter((reviewer) => reviewer.approvedAt).length;
  return {
    dealId: deal.id,
    staged: false,
    amount: formatUsdc(deal.amountBaseUnits),
    state: deal.state,
    signed,
    required: required.length,
    verdict: verdictFor(deal.state, deal.hold?.role, required.length - signed),
    escrowAddress: deal.escrowAddress,
  };
}

export function buildLedger(
  parcelKey: string,
  report: ParcelReport | null,
  deal: Deal | null,
): ParcelLedger {
  const demo = stagedLedger.parcelKey === parcelKey ? stagedLedger : null;
  // The staged story shows only while the API's deal has nothing on-chain.
  const useDemoDeal = Boolean(demo && deal && !hasChainState(deal));
  const chainDeal = deal && hasChainState(deal) ? deal : null;
  const required = deal?.reviewers.filter((reviewer) => reviewer.required) ?? [];
  const approved = required.filter((reviewer) => reviewer.approvedAt).length;

  const biggest = report?.biggestOpenQuestion ?? demo?.biggestOpenQuestion ?? null;
  const kinds = report || demo ? CHECK_KINDS : [];
  const ordered = biggest
    ? [biggest, ...kinds.filter((kind) => kind !== biggest)]
    : [...kinds];

  const records = ordered.map((kind): LedgerRecord => {
    const reported = report?.checks.find((entry) => entry.kind === kind);
    const demoCheck =
      reported || !useDemoDeal ? undefined : demo?.checks.find((entry) => entry.kind === kind);
    // With chain state and no report for this scope, the deal itself answers.
    const fromDeal =
      reported || !chainDeal
        ? undefined
        : kind === "closing"
          ? closingCheck(chainDeal, approved, required.length)
          : ROLE_FOR[kind]
            ? undecidedCheck(kind, ROLE_FOR[kind], chainDeal)
            : undefined;
    const base = reported ?? demoCheck ?? fromDeal ?? unknownCheck(kind);
    const chain = chainCheck(base, deal);
    const check = chain?.check ?? base;
    // The program settles the closing; no one reviewer signs it.
    const role = fromDeal && kind === "closing" ? undefined : ROLE_FOR[kind];
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
  if (deal && useDemoDeal && demo) {
    // The demo layer counts its own staged decisions and says it is staged.
    const statusOf = (role: ReviewerRole) =>
      records.find((record) => record.check.kind === SCOPE[role])?.check.status;
    const signed = required.filter((reviewer) => statusOf(reviewer.role) === "signedOff").length;
    const holdRole = required.find((reviewer) => statusOf(reviewer.role) === "held")?.role;
    escrow = {
      ...summarizeDeal(deal),
      staged: true,
      state: demo.dealState,
      signed,
      verdict: verdictFor(demo.dealState, holdRole, required.length - signed),
    };
  } else if (deal) {
    escrow = summarizeDeal(deal);
  }

  return {
    staged: records.some((record) => record.staged) || Boolean(escrow?.staged),
    biggestOpenQuestion: biggest,
    records,
    escrow,
  };
}

/**
 * The ledger for a parcel: its report (from the API, or null while it is
 * unavailable) with the deal that closes on it, as the API returned it (or
 * null when the parcel has no deal or the deal could not be read).
 */
export function getParcelLedger(
  parcelKey: string,
  report: ParcelReport | null,
  deal: Deal | null,
): ParcelLedger {
  return buildLedger(parcelKey, report, deal?.parcelKey === parcelKey ? deal : null);
}
