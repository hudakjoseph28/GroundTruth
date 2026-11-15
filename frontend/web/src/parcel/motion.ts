// One set of timings and curves for the block transition, the ledger chain,
// and the land block's boundary pulse, so they always move alike. The canvas
// reads the numbers; the stylesheet gets the same numbers as custom properties.
import type { CSSProperties } from "react";

/** Gap between one block (or record) arriving and the next, in milliseconds. */
export const APPEAR_STEP = 110;
/** How long one block (or record) takes to arrive. */
export const APPEAR_MS = 240;
/** How long the white pulse takes to run the transition's chain. */
export const PULSE_MS = 520;
/** How often the pulse repeats while the transition waits. */
export const PULSE_EVERY = 860;
/** The ledger's whole entrance fits inside this. */
export const LEDGER_ENTRANCE_MAX = 1100;
/** Once settled, one faint pulse runs down the ledger (and round the parcel) this often. */
export const AMBIENT_EVERY = 8000;
/** Time that pulse spends on each link of the ledger chain. */
export const AMBIENT_LINK_MS = 150;
/** How long the pulse takes to go round the parcel boundary. */
export const BOUNDARY_LAP_MS = 2600;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Ease-out cubic: fast in, soft landing. The arrival curve everywhere. */
export const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
export const easeInOut = (value: number) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// The same two curves for CSS.
const EASE_OUT_CSS = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const EASE_IN_OUT_CSS = "cubic-bezier(0.645, 0.045, 0.355, 1)";

/** Gap between ledger records arriving: the transition's step, shortened to fit long ledgers. */
export function ledgerStep(count: number): number {
  return Math.min(APPEAR_STEP, (LEDGER_ENTRANCE_MAX - APPEAR_MS) / Math.max(1, count - 1));
}

/** When the last ledger record has arrived, in milliseconds after the page opens. */
export function ledgerSettled(count: number): number {
  return Math.max(0, count - 1) * ledgerStep(count) + APPEAR_MS;
}

/** The shared numbers as custom properties, for the stylesheet. */
export function motionVars(count: number): CSSProperties {
  const vars: Record<`--${string}`, string> = {
    "--step": `${ledgerStep(count)}ms`,
    "--appear": `${APPEAR_MS}ms`,
    "--settled": `${ledgerSettled(count)}ms`,
    "--ambient-every": `${AMBIENT_EVERY}ms`,
    "--ambient-link": `${AMBIENT_LINK_MS}ms`,
    "--ease-out": EASE_OUT_CSS,
    "--ease-in-out": EASE_IN_OUT_CSS,
  };
  return vars;
}
