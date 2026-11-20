import type { Check } from "./contract.js";

/**
 * The closing sentence a live `utilities` check writes when every sewer
 * source that applies answered and none puts public sewer at the lot
 * (backend `src/reports/utilitiesCheck.ts`). The web's bottom line reads it
 * to say that septic soils matter there, so the two sides share the exact
 * words instead of guessing from free text. Copy, not a contract field: a
 * report without one of these sentences simply gets no septic note.
 */
export const NO_PUBLIC_SEWER = {
  /** Public water is mapped at the lot, or its water answer is open. */
  sewer:
    "No public sewer is mapped for this lot, so it likely needs a septic system.",
  /** Neither public water nor public sewer is mapped at the lot. */
  waterAndSewer:
    "No public water or sewer is mapped for this lot, so it likely needs a private well and a septic system.",
} as const;

/** True when a utilities check says no public sewer is mapped for the lot. */
export function findsNoPublicSewer(
  check: Pick<Check, "kind" | "finding">,
): boolean {
  return (
    check.kind === "utilities" &&
    Object.values(NO_PUBLIC_SEWER).some((sentence) =>
      check.finding.includes(sentence),
    )
  );
}
