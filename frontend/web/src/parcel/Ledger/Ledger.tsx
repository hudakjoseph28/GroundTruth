import { useState } from "react";
import { LEDGER } from "../../content/parcel";
import type { LedgerRecord, ParcelLedger } from "../../data/ledger";
import { EscrowStrip } from "./EscrowStrip";
import { Inspector } from "./Inspector";
import { RecordCard } from "./RecordCard";

/**
 * Every check on the parcel as a linked chain of records, under the one
 * escrow that holds the deposit. Staged entries are labeled as staged.
 */
export function Ledger({ ledger }: { ledger: ParcelLedger }) {
  const [open, setOpen] = useState<LedgerRecord | null>(null);

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <header className="ledger-head">
        <h2 id="ledger-title">{LEDGER.title}</h2>
        {ledger.staged && <p className="tag">{LEDGER.stagedTag}</p>}
        <p className="ledger-lede">
          {LEDGER.lede}
          {ledger.staged && <> {LEDGER.stagedNote}</>}
        </p>
      </header>

      {ledger.escrow && <EscrowStrip escrow={ledger.escrow} />}

      {ledger.records.length > 0 ? (
        <ol className="chain">
          {ledger.records.map((record) => (
            <RecordCard
              key={record.check.kind}
              record={record}
              biggest={record.check.kind === ledger.biggestOpenQuestion}
              onOpen={() => setOpen(record)}
            />
          ))}
        </ol>
      ) : (
        <p className="notice" role="status">
          {LEDGER.empty}
        </p>
      )}

      <Inspector record={open} onClose={() => setOpen(null)} />
    </section>
  );
}
