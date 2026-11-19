import type { DealState } from "@groundtruth/shared";
import type { BoundaryTone } from "../parcel/ParcelScene/boundaryTone";

// Pure rules for the deal page's land block, kept apart so they can be tested
// without a browser.

/** The boundary's resting tone for a deal state. Only confirmed state changes it. */
export function landTone(state: DealState): BoundaryTone {
  if (state === "held") return "held";
  if (state === "released") return "released";
  return "gold";
}

/**
 * True when the release ripple should play: the deal turned released while
 * the page was open (not when it was already released on arrival), the
 * scene is drawing, and motion is allowed.
 */
export function shouldRipple({
  liveState,
  ready,
  animated,
}: {
  liveState: DealState | null;
  ready: boolean;
  animated: boolean;
}): boolean {
  return liveState === "released" && ready && animated;
}

export interface UV {
  u: number;
  v: number;
}

/**
 * The area centroid of a ring in picture coordinates (u east, v south), where
 * the hold's lock sits. Falls back to the mean of the points for a ring with
 * no area.
 */
export function ringCentroid(ring: readonly UV[]): UV {
  const points =
    ring.length > 1 &&
    ring[0]!.u === ring[ring.length - 1]!.u &&
    ring[0]!.v === ring[ring.length - 1]!.v
      ? ring.slice(0, -1)
      : ring;
  if (points.length === 0) return { u: 0.5, v: 0.5 };
  let area = 0;
  let u = 0;
  let v = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.u * b.v - b.u * a.v;
    area += cross;
    u += (a.u + b.u) * cross;
    v += (a.v + b.v) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    const sum = points.reduce(
      (total, point) => ({ u: total.u + point.u, v: total.v + point.v }),
      {
        u: 0,
        v: 0,
      },
    );
    return { u: sum.u / points.length, v: sum.v / points.length };
  }
  return { u: u / (3 * area), v: v / (3 * area) };
}
