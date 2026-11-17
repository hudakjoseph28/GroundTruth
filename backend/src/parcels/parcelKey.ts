import type { ParcelKey } from "@groundtruth/shared";

/**
 * Characters a published parcel ID may use to become part of a parcel key.
 *
 * OGRIP's `LocalParcelID` also holds non-parcel rows (vacated roads,
 * cemetery names, `U/I`, blanks, shared all-zero placeholders). Those never
 * fit this rule, so they never get a key. Measured on 2026-11-16: of 44,000
 * sampled IDs across all 88 counties, 16 fit only after trimming whitespace;
 * those are left out rather than keyed by a value the source does not hold.
 */
const PARCEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PLACEHOLDER_ID = /^0+$/;
const MAX_PARCEL_ID_LENGTH = 50;
const PARCEL_KEY = /^ohio:([0-9]{5}):(.+)$/;

export function isKeyableParcelId(id: string): boolean {
  return (
    id.length <= MAX_PARCEL_ID_LENGTH &&
    PARCEL_ID.test(id) &&
    !PLACEHOLDER_ID.test(id)
  );
}

export function formatParcelKey(
  countyFips: string,
  sourceParcelId: string,
): ParcelKey {
  return `ohio:${countyFips}:${sourceParcelId}`;
}

export interface ParsedParcelKey {
  countyFips: string;
  sourceParcelId: string;
}

export function parseParcelKey(value: string): ParsedParcelKey | null {
  const match = PARCEL_KEY.exec(value);
  if (!match) return null;
  const [, countyFips, sourceParcelId] = match;
  if (!countyFips || !sourceParcelId) return null;
  if (!PARCEL_ID.test(sourceParcelId)) return null;
  if (sourceParcelId.length > MAX_PARCEL_ID_LENGTH) return null;
  return { countyFips, sourceParcelId };
}
