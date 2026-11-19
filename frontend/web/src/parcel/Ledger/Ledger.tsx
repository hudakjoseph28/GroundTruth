import { useEffect, useState, type ReactNode } from "react";
import { ESCROW, LEDGER } from "../../content/parcel";
import type { EscrowSummary, LedgerRecord, ParcelLedger } from "../../data/ledger";
import { readDevnetSlot } from "../BlockTransition/devnetSlot";
import { motionVars } from "../motion";
import { usePageHidden } from "../usePageHidden";
import { EscrowStrip } from "./EscrowStrip";
import { Inspector, type Origin } from "./Inspector";
import { RecordCard } from "./RecordCard";
import { ReportSummary } from "./ReportSummary";

/**
 * Every check on the parcel as a linked chain of records, under the one
 * escrow that holds the deposit. Staged entries are labeled as staged.
 *
 * The chain arrives the way the transition's blocks did, then idles quietly.
 * All of that motion lives in the stylesheet; this only says when it may run.
 */
function ClosingsHeader() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    let current = true;
    void readDevnetSlot().then((slot) => {
      if (current) setLive(slot !== null);
    });
    return () => {
      current = false;
    };
  }, []);
  return (
    <header className="closings-head">
      <h3 id="closings-title">{ESCROW.closings}</h3>
      <p className="closings-live" data-live={live}>
        <span className="closings-dot" aria-hidden="true" />
        {live ? ESCROW.devnetLive : ESCROW.devnet}
      </p>
    </header>
  );
}

export function Ledger({
  ledger,
  deals,
  dealNotice,
  revealed,
  animated,
  after,
}: {
  ledger: ParcelLedger;
  /** Every staged deal on this parcel the API returned, for the links under the escrow. */
  deals: readonly EscrowSummary[];
  /** Set when the parcel has a deal the API could not return. */
  dealNotice: { message: string; onRetry: () => void } | null;
  /** False while the transition still covers the page. */
  revealed: boolean;
  /** False when the visitor asked for reduced motion. */
  animated: boolean;
  /** Shown under the checks, e.g. saving the report on Solana. */
  after?: ReactNode;
}) {
  const [open, setOpen] = useState<{ record: LedgerRecord; origin: Origin | null } | null>(null);
  const hidden = usePageHidden();
  const count = ledger.records.length;

  const show = (record: LedgerRecord, node: Element | null) => {
    const rect = node?.getBoundingClientRect();
    setOpen({
      record,
      origin: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
    });
  };

  return (
    <section
      className="ledger"
      aria-labelledby="ledger-title"
      data-revealed={revealed}
      // Ambient motion rests while the tab is hidden or the details are open.
      data-paused={hidden || open !== null || !animated}
      style={motionVars(count)}
    >
      <ReportSummary ledger={ledger} onOpen={show} />

      <header className="ledger-head">
        <h2 id="ledger-title">{LEDGER.title}</h2>
        <p className="ledger-lede">{ledger.hasDeal ? LEDGER.lede : LEDGER.ledeNoDeal}</p>
      </header>

      {deals.length > 0 && (
        <section className="closings" aria-labelledby="closings-title">
          <ClosingsHeader />
          {deals.map((deal) => (
            <EscrowStrip key={deal.dealId} escrow={deal} />
          ))}
        </section>
      )}
      {dealNotice && (
        <div className="notice notice-error" role="alert">
          <p>
            {ESCROW.unavailable} {dealNotice.message}
          </p>
          <button type="button" className="btn btn-small" onClick={dealNotice.onRetry}>
            {ESCROW.retry}
          </button>
        </div>
      )}
      {count > 0 ? (
        <ol className="chain">
          {ledger.records.map((record, index) => (
            <RecordCard
              key={record.check.kind}
              record={record}
              index={index}
              last={index === count - 1}
              biggest={record.check.kind === ledger.biggestOpenQuestion}
              open={open?.record === record}
              onOpen={(node) => show(record, node)}
              chain={ledger.hasDeal}
            />
          ))}
        </ol>
      ) : (
        <p className="notice" role="status">
          {LEDGER.empty}
        </p>
      )}
      {after}

      <Inspector
        record={open?.record ?? null}
        origin={open?.origin ?? null}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
