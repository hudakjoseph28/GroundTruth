import type { Point } from "./chain";

// A land block on one page can be carried into the parcel transition: the link
// that leaves the page passes along where its block was on screen, and the
// transition's last block starts from there. The corners ride in the router's
// navigation state, with a timestamp so a reload or the back button, long
// after the click, does not replay them.

const FRESH_MS = 4000;

interface OriginState {
  blockOrigin: { at: number; corners: Point[] };
}

/** Navigation state for a link that carries a block along, or undefined when there is none. */
export function blockOriginState(corners: Point[] | null): OriginState | undefined {
  return corners ? { blockOrigin: { at: Date.now(), corners } } : undefined;
}

const isPoint = (value: unknown): value is Point =>
  typeof value === "object" &&
  value !== null &&
  "x" in value &&
  "y" in value &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y);

/** The carried corners, if this navigation brought any and they are still fresh. */
export function readBlockOrigin(state: unknown): Point[] | null {
  if (typeof state !== "object" || state === null || !("blockOrigin" in state)) return null;
  const origin = state.blockOrigin;
  if (typeof origin !== "object" || origin === null || !("at" in origin) || !("corners" in origin)) {
    return null;
  }
  const { at, corners } = origin;
  if (typeof at !== "number" || Date.now() - at > FRESH_MS) return null;
  if (!Array.isArray(corners) || corners.length !== 8 || !corners.every(isPoint)) return null;
  return corners;
}
