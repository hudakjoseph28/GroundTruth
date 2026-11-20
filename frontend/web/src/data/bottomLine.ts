import { findsNoPublicSewer, type Check, type CheckKind } from "@groundtruth/shared";
import { SUMMARY } from "../content/parcel";
import type { LedgerRecord, ParcelLedger } from "./ledger";

// The one-sentence bottom line above the ledger. It is built only from the
// ledger's own records, so it can never say more than the cards below it.
//
// It never says a lot can be built on, or that it is safe. The strongest
// claim it makes is "Possibly buildable", and only once the zoning check has
// evidence: zoning is the record that says what may be built at all. Without
// it the lead is "Too early to tell", whatever else is answered. A provider
// failure or a missing record is an unknown, never a reason to lean either way.

export type BottomLineLead = "possibly" | "tooEarly";

export interface BottomLine {
  lead: BottomLineLead;
  /** Checks a reviewer has held, in ledger order. */
  held: readonly CheckKind[];
  /** The report's biggest open question, which the sentence asks about first. */
  first: LedgerRecord | null;
  /** Who can answer it, as the report names them; null when nobody is named. */
  party: string | null;
  /** "Possibly buildable." and any hold, the part a reader takes away. */
  opening: string;
  /** "Check first: road access (title reviewer).", or empty with no question. */
  ask: string;
  /**
   * When the water and sewer check finds no public sewer mapped for the lot,
   * what the septic soils say, since a septic system is then the likely way
   * to handle wastewater. Empty otherwise.
   */
  wastewater: string;
  /** The whole bottom line, as read aloud. */
  text: string;
}

/**
 * "Title reviewer, then surveyor" reads as "title reviewer, then surveyor"
 * mid-sentence; "FEMA flood map" keeps its acronym.
 */
function midSentence(phrase: string): string {
  const trimmed = phrase.trim().replace(/\.+$/, "");
  return /^[A-Z][a-z]/.test(trimmed)
    ? `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`
    : trimmed;
}

/**
 * A party worth naming: the placeholder for an unassigned check is not one.
 * The sentence already wraps the party in parentheses, so the role's own
 * aside is dropped: "Community floodplain administrator (city, village, or
 * county)" reads as "community floodplain administrator". The card keeps it.
 */
function partyFor(record: LedgerRecord): string | null {
  const role = record.check.responsibleParty.role.replace(/\s*\([^)]*\)/g, "").trim();
  if (!role || role === "Unassigned") return null;
  return midSentence(role);
}

const answered = (record: LedgerRecord | undefined) =>
  record !== undefined && record.check.status !== "unknown";

/** SSURGO's septic-tank absorption field ratings, most limiting first. */
const SOIL_RATINGS = ["Very limited", "Somewhat limited", "Not limited"] as const;
export type SoilRating = (typeof SOIL_RATINGS)[number];

/**
 * The most limiting soil rating the septic check reports, and whether every
 * map unit it lists has that rating. Read from the check's own finding
 * (“rated “Very limited””), so it never says more than the card; null when
 * the check names no rating (unknown, or no soils record).
 */
export function septicRating(check: Check | undefined): { worst: SoilRating; all: boolean } | null {
  if (!check || check.kind !== "septic" || check.status === "unknown") return null;
  const found = [...check.finding.matchAll(/rated “(Very limited|Somewhat limited|Not limited)”/g)].map(
    (match) => match[1] as SoilRating,
  );
  const worst = SOIL_RATINGS.find((rating) => found.includes(rating));
  if (!worst) return null;
  return { worst, all: found.every((rating) => rating === worst) };
}

/** The septic note, or empty when public sewer is mapped or unchecked. */
function wastewaterNote(ledger: ParcelLedger): string {
  const utilities = ledger.records.find((record) => record.check.kind === "utilities");
  if (!utilities || !findsNoPublicSewer(utilities.check)) return "";
  const septic = ledger.records.find((record) => record.check.kind === "septic");
  return SUMMARY.noPublicSewer(septicRating(septic?.check));
}

/** The ledger's bottom line, or null when there is no report to summarize. */
export function bottomLine(ledger: ParcelLedger): BottomLine | null {
  if (ledger.records.length === 0) return null;
  const zoning = ledger.records.find((record) => record.check.kind === "zoning");
  const lead: BottomLineLead = answered(zoning) ? "possibly" : "tooEarly";
  const holds = ledger.records
    .filter((record) => record.check.status === "held")
    .map((record) => record.check.kind);
  // A held closing follows from the reviewer's hold: name the hold, once.
  const held = holds.length > 1 ? holds.filter((kind) => kind !== "closing") : holds;
  const first =
    ledger.records.find((record) => record.check.kind === ledger.biggestOpenQuestion) ?? null;
  const party = first ? partyFor(first) : null;

  const opening = SUMMARY.lead(lead, held.map(SUMMARY.noun));
  const ask = first ? SUMMARY.checkFirst(SUMMARY.noun(first.check.kind), party) : "";
  const wastewater = wastewaterNote(ledger);
  return {
    lead,
    held,
    first,
    party,
    opening,
    ask,
    wastewater,
    text: [opening, ask, wastewater].filter(Boolean).join(" "),
  };
}
