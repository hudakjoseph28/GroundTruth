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
import { chainBlocks, pendingOutlines, type ChainBlock } from "../deal/chainBlocks";

// The parcel ledger's view model. It reads the report and the deal, in that
// order of trust: confirmed state on the deal wins, then the report. The deal
// comes from the API (GET /api/deals/:id). Signatures only ever come from the
// report or the deal. A missing check stays unknown; it is never filled in.

/** A public page that explains who confirms a check. Not evidence. */
export interface Reference {
  authority: string;
  title: string;
  url: string;
}

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
  /** A more exact word than the status's own, for records read from a deal. */
  statusLabel?: string;
  /** True when a deal's reviewer or its escrow settles this record. */
  onDeal: boolean;
}

export type VerdictTone = "held" | "pending" | "released" | "quiet";

export type ReviewerMarkState = "approved" | "held" | "waiting" | "missed";

export interface ReviewerMark {
  role: ReviewerRole;
  state: ReviewerMarkState;
}

export interface EscrowSummary {
  dealId: string;
  /** Whole and fractional token units, for example "25" or "25.5". */
  amount: string;
  state: DealState;
  signed: number;
  required: number;
  /** Status pill. One fact, not a sentence. */
  chip: string;
  /** The sentence beside the pill. It does not repeat the chip. */
  line: string;
  verdict: { tone: VerdictTone; text: string };
  reviewers: readonly ReviewerMark[];
  escrowAddress?: string;
  /** Confirmed events, oldest first. */
  blocks: readonly ChainBlock[];
  /** What is still ahead, only while the deal is open. */
  outlines: readonly ChainBlock[];
}

export interface ParcelLedger {
  staged: boolean;
  biggestOpenQuestion: CheckKind | null;
  records: readonly LedgerRecord[];
  escrow: EscrowSummary | null;
  /** False for a parcel with no deal: nothing on it is signed or on-chain. */
  hasDeal: boolean;
  /** Records with evidence or a decision, out of all of them. */
  answered: number;
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
        // Closed, with nothing left to decide: quiet, and labeled "Refunded".
        status: "unknown",
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

const ROLE_ORDER: readonly ReviewerRole[] = ["title", "survey", "septic"];

function nextWaiting(deal: Deal): ReviewerRole | undefined {
  return ROLE_ORDER.find((role) =>
    deal.reviewers.some((reviewer) => reviewer.required && reviewer.role === role && !reviewer.approvedAt),
  );
}

function verdictFor(deal: Deal): EscrowSummary["verdict"] {
  const holdRole = deal.hold?.role;
  if (deal.state === "released") return { tone: "released", text: ESCROW.verdict.released };
  if (deal.state === "refunded") {
    return {
      tone: holdRole ? "held" : "quiet",
      text: holdRole ? ESCROW.verdict.refundedHeld(holdRole) : ESCROW.verdict.refunded,
    };
  }
  if (deal.state === "held") {
    return {
      tone: "held",
      text: holdRole ? ESCROW.verdict.held(holdRole) : ESCROW.verdict.heldUnknown,
    };
  }
  const waiting = nextWaiting(deal);
  if (waiting) return { tone: "pending", text: ESCROW.verdict.waiting(waiting) };
  if (deal.state === "draft") return { tone: "quiet", text: ESCROW.verdict.draft };
  return { tone: "pending", text: ESCROW.verdict.ready };
}

function chipFor(deal: Deal): string {
  if (deal.state === "refunded" && deal.hold) return ESCROW.chip.refundedHeld;
  return ESCROW.chip[deal.state];
}

function reviewerMarks(deal: Deal): ReviewerMark[] {
  const closed = deal.state === "released" || deal.state === "refunded";
  return [...deal.reviewers]
    .filter((reviewer) => reviewer.required)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map((reviewer): ReviewerMark => {
      if (reviewer.approvedAt) return { role: reviewer.role, state: "approved" };
      if (deal.hold?.role === reviewer.role) return { role: reviewer.role, state: "held" };
      if (closed) return { role: reviewer.role, state: "missed" };
      return { role: reviewer.role, state: "waiting" };
    });
}

/** A deal's escrow as the API reports it: nothing staged, nothing assumed. */
export function summarizeDeal(deal: Deal): EscrowSummary {
  const required = deal.reviewers.filter((reviewer) => reviewer.required);
  const signed = required.filter((reviewer) => reviewer.approvedAt).length;
  const verdict = verdictFor(deal);
  return {
    dealId: deal.id,
    amount: formatUsdc(deal.amountBaseUnits),
    state: deal.state,
    signed,
    required: required.length,
    chip: chipFor(deal),
    line: verdict.text,
    verdict,
    reviewers: reviewerMarks(deal),
    escrowAddress: deal.escrowAddress,
    blocks: chainBlocks(deal.timeline),
    outlines: pendingOutlines(deal),
  };
}

export function buildLedger(
  report: ParcelReport | null,
  deal: Deal | null,
): ParcelLedger {
  const chainDeal = deal && hasChainState(deal) ? deal : null;
  const required = deal?.reviewers.filter((reviewer) => reviewer.required) ?? [];
  const approved = required.filter((reviewer) => reviewer.approvedAt).length;

  const biggest = report?.biggestOpenQuestion ?? null;
  // A closing exists only where there is a deal.
  const kinds = (report ? CHECK_KINDS : []).filter(
    (kind) => deal || kind !== "closing",
  );
  const ordered = biggest
    ? [biggest, ...kinds.filter((kind) => kind !== biggest)]
    : [...kinds];

  const records = ordered.map((kind): LedgerRecord => {
    const reported = report?.checks.find((entry) => entry.kind === kind);
    // With chain state and no report for this scope, the deal itself answers.
    const fromDeal =
      reported || !chainDeal
        ? undefined
        : kind === "closing"
          ? closingCheck(chainDeal, approved, required.length)
          : ROLE_FOR[kind]
            ? undecidedCheck(kind, ROLE_FOR[kind], chainDeal)
            : undefined;
    const base = reported ?? fromDeal ?? unknownCheck(kind);
    const chain = chainCheck(base, deal);
    const check = chain?.check ?? base;
    // Reviewers sign only where there is a deal, and the program settles the
    // closing: no one reviewer signs it.
    const role = !deal || (fromDeal && kind === "closing") ? undefined : ROLE_FOR[kind];
    const fromDealOnly = fromDeal !== undefined && !chain;
    const dealClosed = chainDeal ? closed(chainDeal.state) : false;
    const reviewer = role ? deal?.reviewers.find((entry) => entry.role === role) : undefined;
    const signature = chain?.signature ?? check.transactionSignature;
    return {
      check,
      staged: false,
      references: [],
      role,
      signerWallet: check.reviewerWallet ?? reviewer?.wallet,
      signature,
      steps: stepsFor(check, signature),
      statusLabel: !fromDealOnly
        ? undefined
        : kind !== "closing"
          ? CHAIN_FINDINGS.undecidedLabel(dealClosed)
          : chainDeal?.state === "refunded"
            ? CHAIN_FINDINGS.refundedLabel
            : undefined,
      onDeal: Boolean(deal && ROLE_FOR[kind]),
    };
  });

  const escrow = deal ? summarizeDeal(deal) : null;

  return {
    staged: false,
    biggestOpenQuestion: biggest,
    records,
    escrow,
    hasDeal: Boolean(deal),
    answered: records.filter(
      (record) => record.check.status !== "unknown" || record.statusLabel === CHAIN_FINDINGS.refundedLabel,
    ).length,
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
  return buildLedger(report, deal?.parcelKey === parcelKey ? deal : null);
}
