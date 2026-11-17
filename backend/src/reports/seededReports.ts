import type { Check, ParcelReport, Parcel } from "@groundtruth/shared";
import {
  isTemplateKind,
  templateCheck,
  type TemplateKind,
} from "./templates.js";

/**
 * Unknown checks a seeded report words more specifically than the template,
 * by parcel key. Each one is documented beside its fixture in
 * packages/shared/src/fixtures.ts.
 *
 * - Licking 00500729609000, zoning: names the Bowling Green Township zoning
 *   inspector instead of the generic zoning office.
 */
export const SEEDED_TEMPLATE_OVERRIDES: Readonly<
  Record<string, readonly TemplateKind[]>
> = {
  "ohio:39089:00500729609000": ["zoning"],
};

/**
 * The report `db:seed` writes for a hand-verified fixture. Sourced checks
 * come from the fixture as verified. Each `unknown` check of a template kind
 * comes from templateCheck(), the same text a live report uses, unless the
 * parcel has a documented override above. The shared JSON fixtures carry the
 * same text for the frontend; a test keeps the two identical.
 */
export function seededReport(
  parcel: Parcel,
  fixture: ParcelReport,
): ParcelReport {
  if (fixture.parcelKey !== parcel.key) {
    throw new Error("Report does not belong to the parcel");
  }
  const overrides = new Set(SEEDED_TEMPLATE_OVERRIDES[parcel.key] ?? []);
  return {
    ...fixture,
    checks: fixture.checks.map(
      (check): Check =>
        check.status === "unknown" &&
        isTemplateKind(check.kind) &&
        !overrides.has(check.kind)
          ? templateCheck(check.kind, parcel)
          : check,
    ),
  };
}
