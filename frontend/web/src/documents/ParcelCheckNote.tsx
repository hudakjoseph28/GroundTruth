import type { DealDocument, DocumentFindings, DocumentParcelCheckStatus } from "@groundtruth/shared";
import { PARCEL_CHECK } from "../content/documents";

/** How a document's parcel check reads on its card. */
export type ParcelCheckTone = "match" | "warning" | "quiet";

export function parcelCheckTone(status: DocumentParcelCheckStatus): ParcelCheckTone {
  if (status === "matches") return "match";
  if (status === "different") return "warning";
  return "quiet";
}

/**
 * The advisory parcel check on one document card. Anyone sees the status;
 * with `findings` (a signed participant's), the card also names the parcel
 * ID the document prints and what it says.
 */
export function ParcelCheckNote({
  doc,
  findings,
}: {
  doc: DealDocument;
  findings?: DocumentFindings;
}) {
  // A document from an API without checks reads as not checked.
  const status = findings?.parcelCheck.status ?? doc.parcelCheck?.status ?? "unavailable";
  const tone = parcelCheckTone(status);
  const found = findings?.found;
  const headline =
    status === "different" && found?.parcelId
      ? PARCEL_CHECK.differentId(found.parcelId)
      : PARCEL_CHECK[status];

  return (
    <div className="docs-parcel" data-tone={tone} data-status={status}>
      <p className="docs-parcel-head" role={status === "different" ? "alert" : undefined}>
        <span className="docs-parcel-mark" aria-hidden="true">
          {tone === "match" ? "✓" : tone === "warning" ? "!" : "·"}
        </span>
        <strong>{headline}</strong>
      </p>
      {status === "different" &&
        (findings ? (
          <p className="docs-parcel-sub">{PARCEL_CHECK.dealIs(findings.dealParcelId)}</p>
        ) : (
          <p className="docs-parcel-sub">{PARCEL_CHECK.signToSee}</p>
        ))}
      {found && (
        <dl className="docs-found" aria-label={PARCEL_CHECK.found.title}>
          <div>
            <dt>{PARCEL_CHECK.found.type}</dt>
            <dd>{found.documentType}</dd>
          </div>
          <div>
            <dt>{PARCEL_CHECK.found.parcelId}</dt>
            <dd className="mono">{found.parcelId ?? PARCEL_CHECK.found.none}</dd>
          </div>
          <div>
            <dt>{PARCEL_CHECK.found.address}</dt>
            <dd>{found.address ?? PARCEL_CHECK.found.none}</dd>
          </div>
          <div>
            <dt>{PARCEL_CHECK.found.finding}</dt>
            <dd>{found.keyFinding}</dd>
          </div>
        </dl>
      )}
      {(status === "matches" || status === "different" || status === "noParcelId") && (
        <p className="docs-parcel-advisory">
          {findings?.model ? PARCEL_CHECK.readBy(findings.model) : PARCEL_CHECK.advisory}
        </p>
      )}
    </div>
  );
}

/** Documents whose parcel check found a different parcel ID. */
export function mismatchedDocuments(
  docs: readonly DealDocument[],
  findings?: ReadonlyMap<string, DocumentFindings>,
): DealDocument[] {
  return docs.filter(
    (doc) => (findings?.get(doc.id)?.parcelCheck.status ?? doc.parcelCheck?.status) === "different",
  );
}
