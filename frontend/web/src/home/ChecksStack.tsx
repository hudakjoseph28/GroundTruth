import { useEffect, useMemo, useState } from "react";
import { goldenParcel, type CheckKind } from "@groundtruth/shared";
import { HOW } from "../content/home";
import { getParcelLedger, stepsFor, type LedgerRecord } from "../data/ledger";
import { RecordCard } from "../parcel/Ledger/RecordCard";
import { motionVars } from "../parcel/motion";
import "../parcel/parcel.css";

const C = HOW.checks;
const FRAME_MS = 1900;
const ignore = () => {};

/**
 * Three of the demo parcel's ledger records, as the parcel page draws them,
 * stepping through example statuses. A picture of the ledger: nothing in it
 * can be opened from here, and no record claims a signature it does not have.
 */
export function ChecksStack({ running, still }: { running: boolean; still: boolean }) {
  const base = useMemo(() => {
    const records = getParcelLedger(goldenParcel.key).records;
    return C.kinds
      .map((kind) => records.find((record) => record.check.kind === kind))
      .filter((record): record is LedgerRecord => record !== undefined);
  }, []);

  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!running || still) return;
    const timer = window.setInterval(() => setFrame((at) => (at + 1) % C.frames.length), FRAME_MS);
    return () => window.clearInterval(timer);
  }, [running, still]);
  const statuses: Partial<Record<CheckKind, LedgerRecord["check"]["status"]>> =
    C.frames[still ? C.frames.length - 1 : frame] ?? {};

  return (
    <div className="ledger checks-stack" data-revealed={running || still} data-paused={!running} style={motionVars(base.length)} inert>
      <ol className="chain">
        {base.map((record, index) => {
          const check = { ...record.check, status: statuses[record.check.kind] ?? record.check.status };
          return (
            <RecordCard
              key={check.kind}
              record={{ ...record, check, signature: undefined, steps: stepsFor(check, undefined) }}
              index={index}
              last={index === base.length - 1}
              biggest={false}
              open={false}
              onOpen={ignore}
            />
          );
        })}
      </ol>
    </div>
  );
}
