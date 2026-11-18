import type { CheckStatus } from "@groundtruth/shared";
import { STATUS_LABELS } from "../labels";

/** A check status in words, with its color as a second signal. */
export function StatusPill({
  status,
  label,
}: {
  status: CheckStatus;
  /** A more exact word for this record, when the status alone would mislead. */
  label?: string;
}) {
  return (
    <span className={`pill pill-${status}`}>
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
