import { PALETTE } from "../../globe/palette";

/**
 * How the parcel boundary is drawn at rest. "gold" is the parcel being
 * viewed; "held" is a payout locked by a reviewer hold (red, thicker, still);
 * "released" is a payout that reached the seller (green).
 */
export type BoundaryTone = "gold" | "held" | "released";

export const BOUNDARY_TONES: Record<
  BoundaryTone,
  {
    color: string;
    /** 0..1: how much thicker than the usual line. */
    emphasis: number;
    /** Whether the faint pulse still laps the boundary now and then. */
    ambient: boolean;
  }
> = {
  gold: { color: PALETTE.gold, emphasis: 0, ambient: true },
  held: { color: PALETTE.red, emphasis: 0.55, ambient: false },
  released: { color: PALETTE.green, emphasis: 0.3, ambient: true },
};

/** The color a release ripple passes through on its way round. */
export const RIPPLE_COLOR = PALETTE.green;
