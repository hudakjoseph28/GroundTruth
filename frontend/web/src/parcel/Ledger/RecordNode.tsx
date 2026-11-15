import type { CheckStatus } from "@groundtruth/shared";

/**
 * A record's node on the chain: a small wireframe block, like the ones in the
 * transition. Signed off carries a check; the status pill beside it says the
 * same thing in words.
 */
export function RecordNode({ status }: { status: CheckStatus }) {
  return (
    <span className="record-node">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path className="record-node-shell" d="M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z" />
        {status === "signedOff" ? (
          <path className="record-node-check" d="M5.1 8.2 7.2 10.3 11 6" />
        ) : (
          <>
            <path className="record-node-edges" d="M8 8 2.1 4.6M8 8l5.9-3.4M8 8v6.8" />
            <circle className="record-node-point" cx="8" cy="8" r="1.4" />
          </>
        )}
      </svg>
    </span>
  );
}
