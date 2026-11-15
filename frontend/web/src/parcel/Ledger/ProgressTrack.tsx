import { LEDGER } from "../../content/parcel";
import type { LedgerRecord } from "../../data/ledger";

/** Evidence, review, on-chain: how far this record has come. */
export function ProgressTrack({ steps }: { steps: LedgerRecord["steps"] }) {
  return (
    <ol className="track" aria-label="Progress">
      {steps.map((state, index) => (
        <li key={LEDGER.steps[index]} data-state={state}>
          {LEDGER.steps[index]}
          <span className="visually-hidden">: {LEDGER.stepStates[state]}</span>
        </li>
      ))}
    </ol>
  );
}
