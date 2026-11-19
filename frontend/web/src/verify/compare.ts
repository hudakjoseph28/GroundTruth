import type { Deal, DealState, ReviewerRole } from "@groundtruth/shared";
import { HOLD_REASONS, ROLE_LABELS, STATE_LABELS } from "../content/deal";
import { VERIFY } from "../content/verify";
import { formatUsdc } from "../data/ledger";
import type { ChainHold, ChainReviewer } from "./dealAccount";
import type { ChainSnapshot } from "./readChain";

// The escrow account as read from devnet, laid beside the Deal the API gave
// the page, one field at a time. A field matches only when the two agree
// exactly; the chain is the source of truth, so a difference is reported as
// the app being wrong, never smoothed over.

/** What one side says: words, an address, or both ("Approved" + wallet). */
export interface CellValue {
  text?: string;
  address?: string;
}

export interface FieldCheck {
  id: string;
  label: string;
  chain: CellValue;
  app: CellValue;
  match: boolean;
  /** Why it differs, or a fact about a match the reader should know. */
  note?: string;
}

export interface Comparison {
  checks: FieldCheck[];
  mismatches: FieldCheck[];
  matches: boolean;
}

const ROLE_ORDER: readonly ReviewerRole[] = ["title", "survey", "septic"];

export function compareDeal(app: Deal, snapshot: ChainSnapshot): Comparison {
  const chain = snapshot.deal;
  const checks: FieldCheck[] = [
    same("address", VERIFY.fields.address, {
      chain: { text: VERIFY.values.derived, address: snapshot.derivedAddress },
      app: { address: app.escrowAddress ?? "" },
      equal: snapshot.derivedAddress === app.escrowAddress,
    }),
    same("state", VERIFY.fields.state, {
      chain: { text: STATE_LABELS[chain.state] },
      app: { text: STATE_LABELS[app.state] },
      equal: chain.state === app.state,
    }),
    same("amount", VERIFY.fields.amount, {
      chain: { text: usdc(chain.amountBaseUnits) },
      app: { text: usdc(app.amountBaseUnits) },
      equal: chain.amountBaseUnits === app.amountBaseUnits,
    }),
    address("mint", VERIFY.fields.mint, chain.mint, app.mint),
    address("buyer", VERIFY.fields.buyer, chain.buyer, app.buyerWallet),
    address("seller", VERIFY.fields.seller, chain.seller, app.sellerWallet),
    address(
      "payout",
      VERIFY.fields.payout,
      chain.sellerTokenAccount,
      app.sellerTokenAccount,
    ),
    ...reviewerChecks(chain.reviewers, app.reviewers),
    holdCheck(chain.hold, app.hold),
    vaultCheck(snapshot, app),
  ];
  const mismatches = checks.filter((check) => !check.match);
  return { checks, mismatches, matches: mismatches.length === 0 };
}

function same(
  id: string,
  label: string,
  parts: { chain: CellValue; app: CellValue; equal: boolean; note?: string },
): FieldCheck {
  return {
    id,
    label,
    chain: parts.chain,
    app: parts.app,
    match: parts.equal,
    ...(parts.note ? { note: parts.note } : {}),
  };
}

function address(
  id: string,
  label: string,
  chain: string,
  app: string,
): FieldCheck {
  return same(id, label, {
    chain: { address: chain },
    app: { address: app },
    equal: chain === app,
  });
}

function usdc(baseUnits: string): string {
  return `${formatUsdc(baseUnits)} ${VERIFY.values.unit}`;
}

interface AppReviewer {
  wallet: string;
  role: ReviewerRole;
  required: boolean;
  approvedAt?: string;
}

/** One row per reviewer seat, paired by role (and order, if a role repeats). */
function reviewerChecks(
  chain: readonly ChainReviewer[],
  app: readonly AppReviewer[],
): FieldCheck[] {
  const roles = [
    ...ROLE_ORDER,
    ...[...chain, ...app]
      .map((reviewer) => reviewer.role)
      .filter((role) => !ROLE_ORDER.includes(role)),
  ].filter((role, index, all) => all.indexOf(role) === index);

  return roles.flatMap((role) => {
    const onChain = chain.filter((reviewer) => reviewer.role === role);
    const inApp = app.filter((reviewer) => reviewer.role === role);
    const seats = Math.max(onChain.length, inApp.length);
    return Array.from({ length: seats }, (_, seat): FieldCheck => {
      const c = onChain[seat];
      const a = inApp[seat];
      const name = ROLE_LABELS[role] ?? role;
      const label =
        VERIFY.fields.reviewer(name) + (seats > 1 ? ` ${seat + 1}` : "");
      const note = !c || !a
        ? undefined
        : c.wallet !== a.wallet
          ? VERIFY.notes.reviewerWallet
          : c.required !== a.required
            ? VERIFY.notes.reviewerRequired
            : undefined;
      return same(`reviewer-${role}-${seat}`, label, {
        chain: c
          ? seatValue(c.approved, c.required, c.wallet)
          : { text: VERIFY.values.notAssigned },
        app: a
          ? seatValue(Boolean(a.approvedAt), a.required, a.wallet)
          : { text: VERIFY.values.notAssigned },
        equal:
          Boolean(c && a) &&
          c!.wallet === a!.wallet &&
          c!.required === a!.required &&
          c!.approved === Boolean(a!.approvedAt),
        note,
      });
    });
  });
}

function seatValue(
  approved: boolean,
  required: boolean,
  wallet: string,
): CellValue {
  const word = approved ? VERIFY.values.approved : VERIFY.values.notApproved;
  return {
    text: required ? word : `${word} · ${VERIFY.values.optional}`,
    address: wallet,
  };
}

function holdCheck(chain: ChainHold | null, app: Deal["hold"]): FieldCheck {
  const chainSeconds = chain ? Number(chain.placedAtUnix) : null;
  const appSeconds = app ? Math.floor(Date.parse(app.placedAt) / 1000) : null;
  const sameHold =
    chain && app
      ? chain.placedBy === app.placedByWallet &&
        chain.role === app.role &&
        chain.reasonCode === app.reasonCode
      : chain === null && !app;
  const sameTime = !chain || !app || chainSeconds === appSeconds;
  return same("hold", VERIFY.fields.hold, {
    chain: chain
      ? {
          text: holdText(chain.role, chain.reasonCode, chainSeconds!),
          address: chain.placedBy,
        }
      : { text: VERIFY.values.noHold },
    app: app
      ? {
          text: holdText(app.role, app.reasonCode, appSeconds!),
          address: app.placedByWallet,
        }
      : { text: VERIFY.values.noHold },
    equal: sameHold && sameTime,
    note: sameHold && !sameTime ? VERIFY.notes.holdTime : undefined,
  });
}

function holdText(
  role: ReviewerRole,
  reasonCode: keyof typeof HOLD_REASONS,
  seconds: number,
): string {
  return `${ROLE_LABELS[role]} · ${HOLD_REASONS[reasonCode]} · ${utc(seconds)}`;
}

/** "2026-11-18 17:41:19 UTC": exact and the same in every time zone. */
function utc(seconds: number): string {
  if (!Number.isFinite(seconds)) return "unknown time";
  return `${new Date(seconds * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** What the vault should hold for the deal, by the app's own state. */
function expectedInVault(state: DealState, amountBaseUnits: string): string {
  return state === "funded" || state === "held" ? amountBaseUnits : "0";
}

function vaultCheck(snapshot: ChainSnapshot, app: Deal): FieldCheck {
  const expected = expectedInVault(app.state, app.amountBaseUnits);
  const appValue: CellValue = {
    text:
      expected === "0"
        ? `0 ${VERIFY.values.unit} · ${VERIFY.values.expectEmpty}`
        : `${usdc(expected)} ${VERIFY.values.expectFunded}`,
  };
  const vault = snapshot.vault;

  if (vault.status === "foreign") {
    return same("vault", VERIFY.fields.vault, {
      chain: { text: VERIFY.values.notToken, address: vault.address },
      app: appValue,
      equal: false,
    });
  }
  if (vault.status === "closed") {
    return same("vault", VERIFY.fields.vault, {
      chain: { text: `0 ${VERIFY.values.unit} · ${VERIFY.values.closed}` },
      app: appValue,
      equal: expected === "0",
      note: expected === "0" ? undefined : VERIFY.notes.vaultClosed,
    });
  }

  const { token } = vault;
  const held = BigInt(token.amount);
  const want = BigInt(expected);
  // Anyone can send tokens to a vault. That surplus is not the deal's money
  // and the program never pays it out, so it does not make the app wrong.
  const surplus = held > want ? (held - want).toString() : null;
  const note =
    token.owner !== snapshot.address
      ? VERIFY.notes.vaultOwner
      : token.mint !== snapshot.deal.mint
        ? VERIFY.notes.vaultMint
        : surplus
          ? VERIFY.notes.surplus(formatUsdc(surplus))
          : undefined;
  return same("vault", VERIFY.fields.vault, {
    chain: { text: usdc(token.amount) },
    app: appValue,
    equal:
      token.owner === snapshot.address &&
      token.mint === snapshot.deal.mint &&
      held >= want,
    note,
  });
}
