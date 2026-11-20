import type { CSSProperties } from "react";
import { BUILDABLE } from "../../content/buildable";
import { percent } from "../../content/layers";
import { checkTitle, SUMMARY } from "../../content/parcel";
import { bottomLine } from "../../data/bottomLine";
import type { LedgerRecord, ParcelLedger } from "../../data/ledger";
import { STATUS_LABELS } from "../../labels";
import { CheckIcon } from "./CheckIcon";

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** How many checks are answered, as a ring. The words beside it say the same. */
function ProgressRing({ answered, total }: { answered: number; total: number }) {
  const share = total > 0 ? Math.min(answered / total, 1) : 0;
  return (
    <svg className="summary-ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <circle className="summary-ring-track" cx="18" cy="18" r={RING_RADIUS} />
      {share > 0 && (
        <circle
          className="summary-ring-fill"
          cx="18"
          cy="18"
          r={RING_RADIUS}
          strokeDasharray={`${share * RING_LENGTH} ${RING_LENGTH}`}
          transform="rotate(-90 18 18)"
        />
      )}
      <text className="summary-ring-count" x="18" y="18">
        {answered}
      </text>
    </svg>
  );
}

/**
 * The report in one glance: a plain-English bottom line built from the
 * ledger's own records, how many checks have an answer, and every check as
 * an icon colored by its status. Each icon opens that check's details.
 */
export function ReportSummary({
  ledger,
  onOpen,
  override,
  buildableShare,
}: {
  ledger: ParcelLedger;
  onOpen: (record: LedgerRecord, node: Element | null) => void;
  /** The example parcel's own bottom line, in place of the worked-out one. */
  override?: { opening: string; ask: string };
  /** The Buildable area estimate's share of the lot; under half adds one line. */
  buildableShare?: number;
}) {
  const worked = bottomLine(ledger);
  if (!worked) return null;
  const line = override ? { ...worked, ...override } : worked;
  const total = ledger.records.length;
  const half = Math.ceil(total / 2);

  return (
    <section className="summary" aria-labelledby="summary-title" data-lead={line.lead}>
      <h2 id="summary-title" className="summary-title">
        {SUMMARY.title}
      </h2>
      <p className="summary-line">
        <strong>{line.opening}</strong>
        {line.ask && <> {line.ask}</>}
        {line.wastewater && <> {line.wastewater}</>}
      </p>
      {buildableShare !== undefined && buildableShare < 0.5 && (
        <p className="summary-buildable">{BUILDABLE.bottomLine(percent(buildableShare))}</p>
      )}
      <div className="summary-foot">
        <p className="summary-count">
          <ProgressRing answered={ledger.answered} total={total} />
          {SUMMARY.answered(ledger.answered, total)}
        </p>
        <ul
          className="summary-icons"
          aria-label={SUMMARY.checks}
          style={{ "--n": total } as CSSProperties}
        >
          {ledger.records.map((record, index) => {
            const title = checkTitle(record.check.kind);
            const status = record.statusLabel ?? STATUS_LABELS[record.check.status];
            const biggest = record.check.kind === ledger.biggestOpenQuestion;
            return (
              <li key={record.check.kind}>
                <button
                  type="button"
                  className="summary-icon"
                  data-status={record.check.status}
                  data-biggest={biggest || undefined}
                  // Tips open toward the middle so none runs off a phone screen.
                  data-side={index < half ? "start" : "end"}
                  data-tip={SUMMARY.tip(title, status)}
                  aria-haspopup="dialog"
                  onClick={(event) => onOpen(record, event.currentTarget)}
                >
                  <CheckIcon kind={record.check.kind} />
                  <span className="visually-hidden">
                    {title}: {status}
                    {biggest ? ` (${SUMMARY.biggest})` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
