import type { CheckStatus } from "@groundtruth/shared";
import { STATUS_LABELS } from "../labels";

/** A check status in words, with its color as a second signal. */
export function StatusPill({ status }: { status: CheckStatus }) {
  return (
    <span className={`pill pill-${status}`}>{STATUS_LABELS[status]}</span>
  );
}
