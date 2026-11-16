import { useEffect, useRef, useState } from "react";
import type { Attestation, AttestationMark } from "../content/attestations";
import { clamp01, easeOut } from "../parcel/motion";

export interface UV {
  u: number;
  v: number;
}

interface Point {
  x: number;
  y: number;
}

type Side = "left" | "center" | "right";

/**
 * A place a tag can take: which way its card runs from its line, which row it
 * sits on (0 is nearest the land), and the part of the parcel its spot comes
 * from, left to right on screen.
 */
interface Slot {
  side: Side;
  row: number;
  from: number;
  to: number;
}

/**
 * Every line is vertical, so no two can cross. A line could still run through
 * a card on a lower row, so the layouts keep cards out of each other's way:
 * with three, the outer cards run outward on the low row and the middle one
 * sits above them; with two, the left card sits above the right.
 */
const LAYOUTS: Record<1 | 2 | 3, readonly Slot[]> = {
  3: [
    { side: "center", row: 1, from: 0.38, to: 0.62 },
    { side: "left", row: 0, from: 0, to: 0.3 },
    { side: "right", row: 0, from: 0.7, to: 1 },
  ],
  2: [
    { side: "left", row: 1, from: 0, to: 0.34 },
    { side: "right", row: 0, from: 0.66, to: 1 },
  ],
  1: [{ side: "center", row: 0, from: 0.3, to: 0.7 }],
};

/** One tag on screen. */
interface Live {
  key: number;
  event: Attestation;
  slot: Slot;
  anchor: UV;
}

/** What the frame loop keeps for each tag, outside React. */
interface Track {
  /** Runs while the tag is not being hovered. */
  age: number;
  /** How long this tag stays, start to finish. */
  life: number;
  paused: boolean;
}

/** A tag's whole life, and the parts of it. */
const LIFE_MS = 7400;
const LINE_MS = 520;
const CARD_DELAY_MS = 240;
const CARD_MS = 560;
const EXIT_MS = 720;
const RING_MS = 1200;
/** A slot stays empty this long between tags. */
const REST_MS = 500;
/** No two tags appear closer together than this. */
const SPAWN_GAP_MS = 1100;
const RIPPLE_DELAY_MS = 520;
/** How far a card rises as it appears, and again as it leaves. */
const RISE = 12;
const LEAVE = 8;
/** Where a card's line meets it, in from the card's end. */
const INSET = 18;
/** The low row's cards sit this far above the land's highest point. */
const CLEAR = 18;
const ROW_GAP = 14;
/** Room kept between a line and a card it passes. */
const MARGIN = 10;
/** The layer needs this much width for three tags, and this much for two. */
const WIDE = 600;
const NARROW = 330;

const clamp = (value: number, low: number, high: number) =>
  high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value));

/** Where a card of this width sits across the layer, for a line at `x`. */
function span(side: Side, x: number, width: number, layer: number): [number, number] {
  const wanted = side === "left" ? x + INSET - width : side === "right" ? x - INSET : x - width / 2;
  const left = clamp(wanted, 0, layer - width);
  return [left, left + width];
}

/** The slots that fit: fewer when narrow, and one when there is no room above the land for a second row. */
function layoutFor(width: number, max: number, peak: number, tallest: number): readonly Slot[] {
  const across = width >= WIDE ? 3 : width >= NARROW ? 2 : 1;
  const rows = peak - CLEAR - tallest >= tallest + ROW_GAP ? 2 : 1;
  return LAYOUTS[rows < 2 ? 1 : (Math.max(1, Math.min(across, max, 3)) as 1 | 2 | 3)];
}

/** A card already placed, or the worst case for a slot that is still empty. */
interface Placed {
  row: number;
  x: number | null;
  extent: [number, number];
}

/**
 * Tags pinned to the land: each one starts as a pulse at a spot on the parcel,
 * a line runs straight up from it, and a card settles at the top of the line,
 * stays a while, and fades. A few at a time, each in its own place.
 *
 * Decorative: the land's own description says what these show.
 */
export function AttestationTags({
  events,
  still,
  anchors,
  locate,
  animated,
  max,
  onRelease,
}: {
  events: readonly Attestation[];
  /** The tags shown, unmoving, when `animated` is false. */
  still: readonly Attestation[];
  /** Spots inside the parcel that a tag may be pinned to. */
  anchors: readonly UV[];
  /** Where a spot on the land's picture is on screen, in viewport pixels; u runs east and v south, 0 to 1. */
  locate: (u: number, v: number) => Point | null;
  animated: boolean;
  /** The most tags on screen at once: 1 to 3. */
  max: number;
  /** Called a moment after a release tag appears. */
  onRelease?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<readonly Live[]>([]);
  const pills = useRef(new Map<number, HTMLDivElement>());
  const tethers = useRef(new Map<number, SVGGElement>());
  const tracks = useRef(new Map<number, Track>());
  const latest = useRef({ events, still, anchors, locate, max, onRelease });
  useEffect(() => {
    latest.current = { events, still, anchors, locate, max, onRelease };
  }, [events, still, anchors, locate, max, onRelease]);

  useEffect(() => {
    const layer = root.current;
    if (!layer) return;

    let list: Live[] = [];
    let nextKey = 1;
    let cursor = 0;
    let clock = 0;
    let nextSpawn = 450;
    let rippleAt: number | null = null;
    let widest = 216;
    /** When each slot last emptied, by side; the middle goes first. */
    const emptied: Record<Side, number> = { center: -3, left: -2, right: -1 };
    const trackOf = tracks.current;

    const hide = (key: number) => {
      const pill = pills.current.get(key);
      const tether = tethers.current.get(key);
      if (pill) pill.style.opacity = "0";
      if (tether) tether.style.opacity = "0";
    };

    /** The layer's box, and how high the low row's cards sit. Null until the land is drawn. */
    const measure = () => {
      const find = latest.current.locate;
      const box = layer.getBoundingClientRect();
      if (box.width < 1) return null;
      let peak = Infinity;
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const corner = find(u, v);
        if (!corner) return null;
        peak = Math.min(peak, corner.y - box.top);
      }
      let tallest = 52;
      for (const pill of pills.current.values()) {
        tallest = Math.max(tallest, pill.offsetHeight);
        widest = Math.max(widest, pill.offsetWidth);
      }
      return { box, peak, tallest };
    };
    type Frame = NonNullable<ReturnType<typeof measure>>;

    /** A spot for a new tag in this slot that keeps every line clear of every card. */
    const choose = (slot: Slot, slots: readonly Slot[], frame: Frame, random: boolean): UV | null => {
      const { anchors: spots, locate: find } = latest.current;
      const width = frame.box.width;
      const taken = new Set(list.map((entry) => entry.anchor));
      const seen = spots
        .map((spot) => {
          const at = find(spot.u, spot.v);
          return { spot, x: (at?.x ?? NaN) - frame.box.left, y: at?.y ?? 0 };
        })
        .filter((entry) => Number.isFinite(entry.x));
      if (seen.length === 0) return null;
      const low = Math.min(...seen.map((entry) => entry.x));
      const reach = Math.max(1, Math.max(...seen.map((entry) => entry.x)) - low);

      // Everything else: cards on screen as they are, and empty slots at their widest.
      const others: Placed[] = [];
      for (const other of slots) {
        if (other === slot) continue;
        const entry = list.find((candidate) => candidate.slot === other);
        const pill = entry && pills.current.get(entry.key);
        const spot = entry && find(entry.anchor.u, entry.anchor.v);
        if (entry && pill && spot) {
          const x = spot.x - frame.box.left;
          others.push({ row: other.row, x, extent: span(other.side, x, pill.offsetWidth || widest, width) });
        } else if (other.side !== "center") {
          others.push({
            row: other.row,
            x: null,
            extent: other.side === "left" ? [0, widest] : [width - widest, width],
          });
        }
      }
      const clear = (x: number) => {
        const mine = span(slot.side, x, widest, width);
        return others.every((other) => {
          const [from, to] = other.extent;
          // My line runs up past a lower card.
          if (other.row < slot.row) return x < from - MARGIN || x > to + MARGIN;
          // A higher card's line runs up past mine.
          if (other.row > slot.row) return other.x === null || other.x < mine[0] - MARGIN || other.x > mine[1] + MARGIN;
          return other.x === null || mine[1] < from - MARGIN || mine[0] > to + MARGIN;
        });
      };

      const middle = (slot.from + slot.to) / 2;
      const share = (x: number) => (x - low) / reach;
      const free = seen.filter((entry) => !taken.has(entry.spot));
      const inPart = free.filter((entry) => share(entry.x) >= slot.from && share(entry.x) <= slot.to);
      const good = inPart.filter((entry) => clear(entry.x));
      let pool = good.length > 0 ? good : free.filter((entry) => clear(entry.x));
      // A card on an upper row takes a spot toward the back, which keeps its line short.
      if (slot.row > 0 && pool.length > 2) {
        pool = [...pool].sort((a, b) => a.y - b.y).slice(0, Math.ceil(pool.length / 2));
      }
      if (pool.length > 0) {
        if (random) return pool[Math.floor(Math.random() * pool.length)]?.spot ?? null;
        // Unmoving: near the middle of this slot's part, and at a different depth for each slot.
        const off = (entry: (typeof pool)[number]) => Math.abs(share(entry.x) - middle);
        const nearest = Math.min(...pool.map(off));
        const column = pool.filter((entry) => off(entry) <= nearest + 0.06).sort((a, b) => a.y - b.y);
        const depth = slot.side === "center" ? 0.2 : slot.side === "left" ? 0.8 : 0.5;
        return column[Math.round(depth * (column.length - 1))]?.spot ?? null;
      }
      // Nothing is clear: take the spot furthest toward this slot's own side.
      const fallback = (inPart.length > 0 ? inPart : free).reduce<(typeof free)[number] | null>(
        (best, entry) =>
          !best || Math.abs(share(entry.x) - middle) < Math.abs(share(best.x) - middle) ? entry : best,
        null,
      );
      return fallback?.spot ?? null;
    };

    /** Puts one tag where it belongs. `track` is null for a tag that does not move. */
    const place = (entry: Live, track: Track | null, frame: Frame) => {
      const age = track ? track.age : null;
      const life = track ? track.life : LIFE_MS;
      const pill = pills.current.get(entry.key);
      const tether = tethers.current.get(entry.key);
      if (!pill || !tether) return;
      const spot = latest.current.locate(entry.anchor.u, entry.anchor.v);
      const width = pill.offsetWidth;
      const height = pill.offsetHeight;
      if (!spot || width < 1) {
        hide(entry.key);
        return;
      }
      const ax = spot.x - frame.box.left;
      const ay = spot.y - frame.box.top;
      const [left, right] = span(entry.slot.side, ax, width, frame.box.width);
      const rest = frame.peak - CLEAR - entry.slot.row * (frame.tallest + ROW_GAP) - height;
      if (rest < 0) {
        hide(entry.key);
        return;
      }

      const shown = age === null ? 1 : easeOut(clamp01((age - CARD_DELAY_MS) / CARD_MS));
      const gone = age === null ? 0 : clamp01((age - (life - EXIT_MS)) / EXIT_MS);
      const drawn = age === null ? 1 : easeOut(clamp01(age / LINE_MS));
      const top = rest + (1 - shown) * RISE - gone * gone * LEAVE;
      pill.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      pill.style.opacity = (shown * (1 - gone)).toFixed(3);

      // Straight up from the spot to the card's lower edge.
      const foot = clamp(ax, left + INSET / 2, right - INSET / 2);
      const tip = ay + (top + height - ay) * drawn;
      const fade = age === null ? 1 : Math.min(1, age / 160) * (1 - gone);
      drawTether(tether, ax, ay, ax + (foot - ax) * drawn, tip, fade, age === null ? 2 : age / RING_MS);
    };

    let visible = true;
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    watcher.observe(layer);

    // ---------- Still: the same places, nothing moving ----------
    if (!animated) {
      const settle = () => {
        const frame = measure();
        if (!frame) return;
        const slots = layoutFor(frame.box.width, latest.current.max, frame.peak, frame.tallest);
        const next: Live[] = [];
        list = [];
        latest.current.still.slice(0, slots.length).forEach((event, index) => {
          const slot = slots[index];
          const anchor = slot ? choose(slot, slots, frame, false) : null;
          if (!slot || !anchor) return;
          const entry = { key: -1 - index, event, slot, anchor };
          list = [...list, entry];
          next.push(entry);
        });
        setLive((current) =>
          current.length === next.length &&
          current.every((entry, index) => entry.anchor === next[index]?.anchor && entry.slot === next[index]?.slot)
            ? current
            : next,
        );
        for (const entry of next) place(entry, null, frame);
      };
      // The land arrives a little after the layer does: place now, and again as things settle.
      const timers = [0, 120, 500, 1400, 2600].map((wait) => window.setTimeout(settle, wait));
      const resizer = new ResizeObserver(settle);
      resizer.observe(layer);
      return () => {
        timers.forEach((timer) => window.clearTimeout(timer));
        resizer.disconnect();
        watcher.disconnect();
        setLive([]);
      };
    }

    // ---------- Moving ----------
    let id = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = null;
        return;
      }
      const delta = Math.min(64, last === null ? 16 : now - last);
      last = now;
      const frame = measure();
      if (!frame) return;
      const { events: pool, max: most, onRelease: release } = latest.current;
      const slots = layoutFor(frame.box.width, most, frame.peak, frame.tallest);

      clock += delta;
      for (const entry of list) {
        const track = trackOf.get(entry.key);
        if (track && !track.paused) track.age += delta;
      }

      // Retire.
      const kept = list.filter((entry) => {
        const track = trackOf.get(entry.key);
        const done = !track || track.age >= track.life;
        if (done) {
          trackOf.delete(entry.key);
          emptied[entry.slot.side] = clock;
        }
        return !done;
      });
      let changed = kept.length !== list.length;
      list = kept;

      // Add one, in the slot that has been empty longest.
      if (clock >= nextSpawn && pool.length > 0) {
        const open = slots
          .filter((slot) => !list.some((entry) => entry.slot.side === slot.side))
          .filter((slot) => clock - emptied[slot.side] >= REST_MS)
          .sort((a, b) => emptied[a.side] - emptied[b.side]);
        const slot = open[0];
        const event = pool[cursor % pool.length];
        const anchor = slot ? choose(slot, slots, frame, true) : null;
        if (slot && event && anchor) {
          // The first few arrive close together and stay a little longer, each
          // more than the last, so that from then on one changes at a time, evenly.
          const even = (LIFE_MS + REST_MS) / slots.length;
          const extra = cursor < slots.length ? cursor * Math.max(0, even - SPAWN_GAP_MS) : 0;
          cursor += 1;
          const key = nextKey++;
          trackOf.set(key, { age: 0, life: LIFE_MS + extra, paused: false });
          list = [...list, { key, event, slot, anchor }];
          changed = true;
          if (event.release) rippleAt = clock + RIPPLE_DELAY_MS;
          nextSpawn = clock + SPAWN_GAP_MS;
        }
      }
      if (rippleAt !== null && clock >= rippleAt) {
        rippleAt = null;
        release?.();
      }
      if (changed) setLive(list);

      for (const entry of list) {
        const track = trackOf.get(entry.key);
        if (track) place(entry, track, frame);
      }
    };
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      watcher.disconnect();
      trackOf.clear();
      setLive([]);
    };
  }, [animated]);

  const pause = (key: number, paused: boolean) => {
    const track = tracks.current.get(key);
    if (track) track.paused = paused;
  };

  return (
    <div ref={root} className="att-layer" aria-hidden="true">
      <svg className="att-lines">
        {live.map((entry) => (
          <g
            key={entry.key}
            data-tone={entry.event.tone}
            ref={(node) => {
              if (node) tethers.current.set(entry.key, node);
              else tethers.current.delete(entry.key);
            }}
          >
            <line className="att-line" />
            <circle className="att-ring" />
            <circle className="att-spot" r="2.6" />
          </g>
        ))}
      </svg>
      {live.map((entry) => (
        <div
          key={entry.key}
          className="att"
          data-tone={entry.event.tone}
          ref={(node) => {
            if (node) pills.current.set(entry.key, node);
            else pills.current.delete(entry.key);
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") pause(entry.key, true);
          }}
          onPointerLeave={() => pause(entry.key, false)}
        >
          <span className="att-pill">
            <span className="att-who">
              <i className="att-dot" />
              <span className={entry.event.wallet ? "att-actor mono" : "att-actor"}>{entry.event.actor}</span>
              <span className="att-verb">{entry.event.verb}</span>
            </span>
            <span className="att-what">
              <span className="att-detail">{entry.event.detail}</span>
              <Mark mark={entry.event.mark} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The line from a spot on the land up to its tag, and the ring that marks the spot. */
function drawTether(
  group: SVGGElement,
  ax: number,
  ay: number,
  x: number,
  y: number,
  opacity: number,
  ringAge: number,
) {
  group.style.opacity = opacity.toFixed(3);
  for (const child of Array.from(group.children)) {
    if (child instanceof SVGLineElement) {
      child.setAttribute("x1", ax.toFixed(1));
      child.setAttribute("y1", ay.toFixed(1));
      child.setAttribute("x2", x.toFixed(1));
      child.setAttribute("y2", y.toFixed(1));
    } else if (child instanceof SVGCircleElement) {
      child.setAttribute("cx", ax.toFixed(1));
      child.setAttribute("cy", ay.toFixed(1));
      if (child.classList.contains("att-ring")) {
        const t = clamp01(ringAge);
        child.setAttribute("r", (3 + 15 * easeOut(t)).toFixed(1));
        child.style.opacity = (0.8 * (1 - t)).toFixed(3);
      }
    }
  }
}

function Mark({ mark }: { mark: AttestationMark }) {
  if (mark === "none") return null;
  return (
    <svg className="att-mark" viewBox="0 0 12 12">
      {mark === "check" && <path d="M2.4 6.3 5 8.8 9.7 3.4" />}
      {mark === "cross" && <path d="M3 3l6 6M9 3 3 9" />}
      {mark === "lock" && (
        <>
          <rect x="2.6" y="5.4" width="6.8" height="5" rx="1" />
          <path d="M4.2 5.4V4a1.8 1.8 0 0 1 3.6 0v1.4" />
        </>
      )}
    </svg>
  );
}
