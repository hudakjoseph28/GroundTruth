import { BUILDABLE } from "../../content/buildable";
import { percent } from "../../content/layers";
import type { BuildableAreaEstimate, BuildableSource } from "./estimate";

/** Acres to one decimal, as the headline writes them. */
export const acres = (value: number) => value.toFixed(1);

function removed(value: number): string {
  if (value <= 0) return BUILDABLE.noneOnLot;
  if (value < 0.05) return BUILDABLE.underTenth;
  return `${acres(value)} ${value >= 0.95 && value < 1.05 ? "acre" : "acres"}`;
}

function SourceLink({ source }: { source: BuildableSource | null }) {
  if (!source) return null;
  return (
    <a href={source.url} target="_blank" rel="noreferrer">
      {source.title}
    </a>
  );
}

/**
 * "Of 3.0 acres, about X acres (Y%) look buildable", with what took the rest
 * away and what was left out. Always labeled an estimate from public maps.
 * `compact` (the walkthrough) keeps the numbers and drops the explanations.
 */
export function BuildableAreaCard({
  estimate,
  compact = false,
}: {
  estimate: BuildableAreaEstimate;
  compact?: boolean;
}) {
  return (
    <section
      className="buildable-card"
      data-compact={compact || undefined}
      aria-labelledby="buildable-title"
    >
      <p className="buildable-kicker">
        <span className="buildable-swatch" aria-hidden="true" />
        {BUILDABLE.kicker}
      </p>
      <h2 id="buildable-title">
        {BUILDABLE.headline(
          acres(estimate.totalAcres),
          acres(estimate.buildableAcres),
          percent(estimate.buildableShare),
        )}
      </h2>
      <p className="buildable-disclaimer">{BUILDABLE.disclaimer}</p>
      <ul className="buildable-deductions" aria-label={BUILDABLE.removedLabel}>
        {estimate.deductions.map((deduction) => (
          <li key={deduction.id}>
            <p className="buildable-row">
              <strong>{deduction.label}</strong>
              <span>{removed(deduction.acres)}</span>
            </p>
            {!compact && (
              <>
                <p>{deduction.detail}</p>
                <SourceLink source={deduction.source} />
              </>
            )}
          </li>
        ))}
      </ul>
      {!compact && <p className="buildable-note">{BUILDABLE.overlap}</p>}
      {compact && estimate.skipped.length > 0 && (
        <p className="buildable-note">
          {BUILDABLE.skippedTitle}:{" "}
          {estimate.skipped.map((item) => item.label).join(", ")}.
        </p>
      )}
      {!compact && estimate.skipped.length > 0 && (
        <div className="buildable-skipped">
          <p>
            <strong>{BUILDABLE.skippedTitle}</strong>
          </p>
          <ul>
            {estimate.skipped.map((item) => (
              <li key={item.id}>
                <strong>{item.label}:</strong> {item.reason}{" "}
                <SourceLink source={item.source} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="buildable-next">{BUILDABLE.next}</p>
    </section>
  );
}
