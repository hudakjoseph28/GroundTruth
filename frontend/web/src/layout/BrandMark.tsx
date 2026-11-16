/**
 * The GroundTruth mark: one wireframe block, the same shape as the blocks in
 * the parcel transition and the nodes on the ledger, with the parcel in view
 * as a gold point at its center.
 */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
      <path className="brand-mark-shell" d="M10 1.6 17.3 5.8v8.4L10 18.4 2.7 14.2V5.8Z" />
      <path className="brand-mark-edges" d="M10 10 2.7 5.8M10 10l7.3-4.2M10 10v8.4" />
      <circle className="brand-mark-point" cx="10" cy="10" r="1.7" />
    </svg>
  );
}
