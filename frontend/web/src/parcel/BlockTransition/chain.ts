import { PALETTE, rgb } from "../../globe/palette";
import { APPEAR_MS, APPEAR_STEP, PULSE_EVERY, PULSE_MS, clamp01 as clamp, easeInOut, easeOut } from "../motion";
import { BOX_EDGES, boxCorners, stageProjector, type BlockDims } from "../ParcelScene/blockFrame";

// The chain of blocks, drawn in the globe's point-and-line style on a 2D
// canvas. The last block turns gold and flies to where the land block sits.

export interface Point {
  x: number;
  y: number;
}

export interface ChainFrame {
  width: number;
  height: number;
  /** Milliseconds since the transition started. */
  now: number;
  /** When the hand-off began, or null while the chain is still waiting. */
  handoffAt: number | null;
  /** One label per block, or null while the slot is being read. */
  labels: readonly string[] | null;
  /** Where the land block's eight corners sit on screen, when there is one. */
  target: readonly Point[] | null;
  /**
   * Where the land block was on the page the visitor came from, as eight
   * corners in boxCorners order. The chain's last block starts there.
   */
  origin: Point[] | null;
}

export const HANDOFF_MS = 620;
/** A block arriving from elsewhere on the previous page takes this long to join the chain. */
export const ARRIVE_MS = 560;

const CUBE: BlockDims = { width: 1.5, depth: 1.5, top: 0.75, base: -0.75, unitsPerMeter: 0 };
const WHITE: readonly [number, number, number] = [1, 1, 1];
const GOLD = rgb(PALETTE.gold);

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const color = (from: readonly number[], to: readonly number[], t: number, alpha: number) =>
  `rgba(${[0, 1, 2].map((i) => Math.round(mix(from[i] ?? 1, to[i] ?? 1, t) * 255)).join(",")},${alpha})`;

/** How many blocks fit, where they sit, and how big they are. */
export function chainLayout(width: number, height: number) {
  const count = width < 560 ? 3 : width < 1200 ? 4 : 5;
  const spacing = Math.min((width - 40) / count, 190);
  const size = spacing * 0.68;
  const y = height * 0.44;
  const centers: Point[] = Array.from({ length: count }, (_, index) => ({
    x: width / 2 + (index - (count - 1) / 2) * spacing,
    y,
  }));
  return { count, spacing, size, centers };
}

let cubeCache: { size: number; corners: Point[] } | null = null;

/** A cube's corners around its center, seen from the land block's camera. */
export function cubeCorners(size: number): Point[] {
  if (cubeCache?.size !== size) {
    const project = stageProjector(size, size, CUBE);
    cubeCache = {
      size,
      corners: boxCorners(CUBE).map((corner) => {
        const point = project(corner);
        return { x: point.x - size / 2, y: point.y - size / 2 };
      }),
    };
  }
  return cubeCache.corners;
}

/** One wireframe block: twelve edges and a glowing point on each corner. */
export function drawBox(
  context: CanvasRenderingContext2D,
  corners: readonly Point[],
  stroke: string,
  dot: string,
  lineWidth: number,
  glow: number,
) {
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.shadowColor = stroke;
  context.shadowBlur = glow;
  context.beginPath();
  for (const [a, b] of BOX_EDGES) {
    const from = corners[a];
    const to = corners[b];
    if (!from || !to) continue;
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
  }
  context.stroke();

  context.fillStyle = dot;
  context.shadowColor = dot;
  context.shadowBlur = 6;
  context.beginPath();
  for (const corner of corners) {
    context.moveTo(corner.x + 1.6, corner.y);
    context.arc(corner.x, corner.y, 1.6, 0, Math.PI * 2);
  }
  context.fill();
  context.shadowBlur = 0;
}

export function drawChain(context: CanvasRenderingContext2D, frame: ChainFrame): void {
  const { width, height, now, handoffAt, labels, target, origin } = frame;
  const { count, spacing, size, centers } = chainLayout(width, height);
  const offsets = cubeCorners(size);
  const last = count - 1;
  const handoff = handoffAt === null ? null : now - handoffAt;
  // Everything but the last block leaves as the hand-off starts.
  const rest = handoff === null ? 1 : 1 - easeOut(handoff / 220);

  context.clearRect(0, 0, width, height);
  context.lineCap = "round";

  // The pulse runs down the chain once the blocks are in, then keeps time.
  const first = centers[0];
  const end = centers[last];
  const pulseStart = last * APPEAR_STEP + APPEAR_MS - 80;
  let pulseX: number | null = null;
  if (first && end && handoff === null && now >= pulseStart) {
    const phase = (now - pulseStart) % PULSE_EVERY;
    if (phase <= PULSE_MS) pulseX = mix(first.x, end.x, easeInOut(phase / PULSE_MS));
  }

  // Links first, so the blocks sit on top of them.
  for (let index = 0; index < last; index++) {
    const from = centers[index];
    const to = centers[index + 1];
    if (!from || !to) continue;
    const drawn = easeOut((now - (index + 1) * APPEAR_STEP) / APPEAR_MS) * rest;
    if (drawn <= 0) continue;
    const inset = size * 0.46;
    const x0 = from.x + inset;
    const x1 = mix(x0, to.x - inset, drawn);
    context.lineWidth = 1;
    context.strokeStyle = `rgba(255,255,255,${0.42 * rest})`;
    context.shadowColor = "rgba(255,255,255,0.9)";
    context.shadowBlur = 5;
    context.beginPath();
    context.moveTo(x0, from.y);
    context.lineTo(x1, from.y);
    context.stroke();
    context.shadowBlur = 0;
  }

  centers.forEach((center, index) => {
    const isLast = index === last;
    // A block carried over from the previous page is there from the first frame.
    const carried = isLast && origin !== null;
    const appear = carried ? 1 : easeOut((now - index * APPEAR_STEP) / APPEAR_MS);
    if (appear <= 0) return;
    const scale = 0.7 + 0.3 * appear;
    let corners = offsets.map((offset) => ({
      x: center.x + offset.x * scale,
      y: center.y + offset.y * scale,
    }));
    // It flies in from where it was, gold, and settles into the chain as white.
    const arrive = carried ? easeInOut(now / ARRIVE_MS) : 1;
    if (carried && arrive < 1) {
      corners = corners.map((corner, at) => {
        const from = origin[at] ?? corner;
        return { x: mix(from.x, corner.x, arrive), y: mix(from.y, corner.y, arrive) };
      });
    }
    const lit = pulseX === null ? 0 : clamp(1 - Math.abs(pulseX - center.x) / (spacing * 0.55));

    if (isLast && handoff !== null) {
      // Flash gold, then become the land block (or fade, if there is none).
      const gold = easeOut(handoff / 160);
      const flash = 1 - clamp(handoff / 320);
      const travel = easeInOut((handoff - 140) / (HANDOFF_MS - 140));
      let alpha = 1;
      if (target) {
        corners = corners.map((corner, at) => {
          const to = target[at] ?? corner;
          return { x: mix(corner.x, to.x, travel), y: mix(corner.y, to.y, travel) };
        });
      } else {
        alpha = 1 - easeOut((handoff - 200) / (HANDOFF_MS - 200));
      }
      drawBox(
        context,
        corners,
        color(WHITE, GOLD, gold, (0.75 + 0.25 * flash) * alpha),
        color(WHITE, GOLD, gold * 0.6, alpha),
        1.1 + 0.9 * flash,
        4 + 14 * flash,
      );
    } else if (arrive < 1) {
      drawBox(
        context,
        corners,
        color(GOLD, WHITE, arrive, 0.95 - 0.45 * arrive),
        color(GOLD, WHITE, arrive, 1),
        1 + 0.6 * (1 - arrive),
        2 + 12 * (1 - arrive),
      );
    } else {
      const alpha = appear * (isLast ? 1 : rest);
      drawBox(
        context,
        corners,
        `rgba(255,255,255,${(0.5 + 0.45 * lit) * alpha})`,
        `rgba(255,255,255,${alpha})`,
        1,
        2 + 8 * lit,
      );
    }

    const label = labels?.[index];
    const labelAlpha = appear * rest * (carried ? clamp((now - ARRIVE_MS * 0.6) / 200) : 1);
    if (label && labelAlpha > 0) {
      context.font = `${spacing < 130 ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillStyle = `rgba(169,169,169,${labelAlpha})`;
      context.fillText(label, center.x, center.y + size * 0.5 + 10);
    }
  });

  if (pulseX !== null && first) {
    context.fillStyle = "#fff";
    context.shadowColor = "#fff";
    context.shadowBlur = 12;
    context.beginPath();
    context.arc(pulseX, first.y, 2.4, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }
}
