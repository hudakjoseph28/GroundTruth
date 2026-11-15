import { useState } from "react";
import { LEDGER } from "../../content/parcel";
import type { LedgerRecord, ParcelLedger } from "../../data/ledger";
import { motionVars } from "../motion";
import { usePageHidden } from "../usePageHidden";
import { EscrowStrip } from "./EscrowStrip";
import { Inspector, type Origin } from "./Inspector";
import { RecordCard } from "./RecordCard";

/**
 * Every check on the parcel as a linked chain of records, under the one
 * escrow that holds the deposit. Staged entries are labeled as staged.
 *
 * The chain arrives the way the transition's blocks did, then idles quietly.
 * All of that motion lives in the stylesheet; this only says when it may run.
 */
export function Ledger({
  ledger,
  revealed,
  animated,
}: {
  ledger: ParcelLedger;
  /** False while the transition still covers the page. */
  revealed: boolean;
  /** False when the visitor asked for reduced motion. */
  animated: boolean;
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
      data-paused={hidden || open !== null}
      style={motionVars(count)}
    >
      <header className="ledger-head">
        <h2 id="ledger-title">{LEDGER.title}</h2>
        {ledger.staged && <p className="tag">{LEDGER.stagedTag}</p>}
        <p className="ledger-lede">
          {LEDGER.lede}
          {ledger.staged && <> {LEDGER.stagedNote}</>}
        </p>
      </header>

      {ledger.escrow && (
        <EscrowStrip escrow={ledger.escrow} counting={revealed} animated={animated} />
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
            />
          ))}
        </ol>
      ) : (
        <p className="notice" role="status">
          {LEDGER.empty}
        </p>
      )}

      <Inspector
        record={open?.record ?? null}
        origin={open?.origin ?? null}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
