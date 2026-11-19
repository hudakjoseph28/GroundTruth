import type { ActivityEvent, TimelineEventType } from "@groundtruth/shared";
import { ACTIVITY, ACTIVITY_EVENTS } from "../content/activity";
import { explorerTxUrl, formatUsdc } from "../data/ledger";

export type ActivityTone = "gold" | "green" | "red" | "quiet";

export interface ActivityRow {
  id: string;
  /** "Septic reviewer approved" */
  what: string;
  /** "10 test USDC deal" */
  deal: string;
  at: string;
  tone: ActivityTone;
  href: string;
}

const TONE: Record<TimelineEventType, ActivityTone> = {
  dealCreated: "gold",
  funded: "gold",
  evidenceReceived: "quiet",
  approvalSigned: "green",
  holdPlaced: "red",
  releaseRejected: "red",
  released: "green",
  refunded: "quiet",
};

const REVIEWER_ROLES = new Set(["title", "survey", "septic"]);

export function toActivityRow(event: ActivityEvent): ActivityRow {
  const role =
    event.actorRole && REVIEWER_ROLES.has(event.actorRole)
      ? capitalize(event.actorRole)
      : undefined;
  const describe = ACTIVITY_EVENTS[event.type] as
    | ((role: string | undefined) => string)
    | undefined;
  return {
    id: event.id,
    what: describe ? describe(role) : event.buyerMessage,
    deal: ACTIVITY.deal(formatUsdc(event.dealAmountBaseUnits)),
    at: event.at,
    tone: TONE[event.type] ?? "quiet",
    href: explorerTxUrl(event.transactionSignature),
  };
}

/** "just now", "45 s ago", "2 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
