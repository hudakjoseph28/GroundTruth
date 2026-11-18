import { LEDGER } from "../../content/parcel";
import type { LedgerRecord } from "../../data/ledger";

/**
 * Evidence, review, on-chain: how far this record has come. Without a deal
 * there is no chain step to reach, so it stops at review.
 */
export function ProgressTrack({
  steps,
  chain = true,
}: {
  steps: LedgerRecord["steps"];
  chain?: boolean;
}) {
  return (
    <ol className="track" aria-label="Progress">
      {(chain ? steps : steps.slice(0, 2)).map((state, index) => (
        <li key={LEDGER.steps[index]} data-state={state}>
          {LEDGER.steps[index]}
          <span className="visually-hidden">: {LEDGER.stepStates[state]}</span>
        </li>
      ))}
    </ol>
  );
}
