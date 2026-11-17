import { countyByFips } from "./ohioCounties.js";
import { PARCEL_ID_FORMATS } from "./parcelIdFormats.js";
import { isKeyableParcelId } from "./parcelKey.js";

const SEPARATORS = /[-.\s]/g;
const MAX_CANDIDATES = 25;

/**
 * Separator layout of a parcel ID: each alphanumeric run becomes its length.
 * `010-042534` → `3-6`, `45-03349.000` → `2-5.3`, `00100000601000` → `14`.
 */
export function idFormat(id: string): string {
  return id.replace(/[A-Za-z0-9]+/g, (run) => String(run.length));
}

/** Re-punctuates `compact` (no separators) into `format`, or null. */
export function applyIdFormat(compact: string, format: string): string | null {
  const parts = format.match(/\d+|\D/g) ?? [];
  const total = parts.reduce((sum, part) => sum + (Number(part) || 0), 0);
  if (total !== compact.length) return null;
  let at = 0;
  return parts
    .map((part) => {
      if (!/^\d+$/.test(part)) return part;
      const run = compact.slice(at, at + Number(part));
      at += Number(part);
      return run;
    })
    .join("");
}

/**
 * Every published form a typed parcel ID could take. Keys use
 * `LocalParcelID` exactly as OGRIP publishes it, and counties punctuate
 * differently (Franklin `010-042534`, Licking `00100000601000`), so a typed
 * ID is tried as typed, without separators, and re-punctuated in every
 * separator layout measured in the live layer (see parcelIdFormats.ts).
 */
export function parcelIdCandidates(query: string): string[] {
  const upper = query.trim().toUpperCase();
  const compact = upper.replace(SEPARATORS, "");
  const candidates = [query.trim(), upper, compact];
  for (const [format] of PARCEL_ID_FORMATS) {
    const formatted = applyIdFormat(compact, format);
    if (formatted) candidates.push(formatted);
  }
  return [...new Set(candidates.filter(isKeyableParcelId))].slice(
    0,
    MAX_CANDIDATES,
  );
}

/**
 * Equality filter for a parcel-ID query: `LocalParcelID IN (...)` over the
 * candidates, plus the statewide form `39049-010-042534` read as county +
 * local ID. Every value passes the parcel-ID character rule before it is
 * quoted, so user text can never become anything but an ID literal.
 */
export function parcelIdWhere(query: string): string | null {
  const clauses: string[] = [];
  const ids = parcelIdCandidates(query);
  if (ids.length > 0) {
    clauses.push(`LocalParcelID IN (${ids.map(sqlString).join(",")})`);
  }
  const statewide = /^(39\d{3})-(.+)$/.exec(query.trim().toUpperCase());
  const county = statewide?.[1] ? countyByFips(statewide[1]) : undefined;
  const localIds = statewide?.[2] ? parcelIdCandidates(statewide[2]) : [];
  if (county && localIds.length > 0) {
    clauses.push(
      `(County=${sqlString(county.name)} AND LocalParcelID IN (${localIds.map(sqlString).join(",")}))`,
    );
  }
  return clauses.length > 0 ? clauses.join(" OR ") : null;
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
