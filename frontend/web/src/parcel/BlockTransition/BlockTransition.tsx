import { useCallback, useEffect, useRef, useState } from "react";
import { TRANSITION } from "../../content/parcel";
import { blockDims, boxCorners, stageProjector, type Vec3 } from "../ParcelScene/blockFrame";
import type { LandMeta } from "../ParcelScene/landMeta";
import type { RenderMode } from "../useRenderMode";
import { HANDOFF_MS, chainLayout, drawChain, type Point } from "./chain";
import { readDevnetSlot } from "./devnetSlot";

/** The chain is on screen at least this long before it hands off. */
const MIN_MS = 750;
/** The hand-off starts by now even if the land is still loading. */
const MAX_MS = 1500;
const LEAVE_MS = 150;
/** Used only when the devnet slot cannot be read, and labeled as illustrative. */
const ILLUSTRATIVE_SLOT = 412_883_107;
/** The land scene starts a little small and grows in; the gold frame lands on that. */
const LANDING_SCALE = 0.94;

type Slot = { kind: "pending" } | { kind: "live"; slot: number } | { kind: "illustrative" };

/**
 * Covers the parcel page while it loads: a short chain of blocks whose last
 * block becomes the land block. With motion reduced it is a line of text and
 * a quick fade. Any key or a click skips it.
 */
export function BlockTransition({
  mode,
  ready,
  meta,
  origin = null,
  onDone,
}: {
  mode: RenderMode;
  /** True once the land (or its fallback) is drawn underneath. */
  ready: boolean;
  meta: LandMeta | null;
  /**
   * Corners of a land block on the page the visitor just left. When given, the
   * chain's last block starts there, so that block is seen to become this one.
   */
  origin?: Point[] | null;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [slot, setSlot] = useState<Slot>({ kind: "pending" });
  const [phase, setPhase] = useState<"chain" | "handoff" | "leaving">("chain");
  const animated = mode === "webgl" || mode === "fallback";

  const live = useRef({ ready, meta, slot, origin, onDone });
  useEffect(() => {
    live.current = { ready, meta, slot, origin, onDone };
  }, [ready, meta, slot, origin, onDone]);

  const finished = useRef(false);
  const leaveTimer = useRef(0);
  /** Fade out and let the page through. Safe to call more than once. */
  const leave = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase("leaving");
    leaveTimer.current = window.setTimeout(() => live.current.onDone(), LEAVE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (!animated) return;
    let current = true;
    void readDevnetSlot().then((value) => {
      if (current) setSlot(value === null ? { kind: "illustrative" } : { kind: "live", slot: value });
    });
    return () => {
      current = false;
    };
  }, [animated]);

  // Esc, or any other key, skips. Keys held with a modifier are left alone.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  // Reduced motion: nothing to play, so leave as soon as the page is ready.
  useEffect(() => {
    if (mode !== "reduced") return;
    if (ready) {
      leave();
      return;
    }
    const timer = window.setTimeout(leave, MAX_MS);
    return () => window.clearTimeout(timer);
  }, [mode, ready, leave]);

  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!animated || !node || !context) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = node.clientWidth;
      height = node.clientHeight;
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let id = 0;
    let start: number | null = null;
    let handoffAt: number | null = null;
    const loop = (time: number) => {
      id = requestAnimationFrame(loop);
      if (finished.current) return;
      start ??= time;
      const now = time - start;
      const state = live.current;

      if (handoffAt === null && ((state.ready && now >= MIN_MS) || now >= MAX_MS)) {
        handoffAt = now;
        setPhase("handoff");
      }

      drawChain(context, {
        width,
        height,
        now,
        handoffAt,
        labels: slotLabels(state.slot, chainLayout(width, height)),
        target: handoffAt === null ? null : landingCorners(state.meta),
        origin: state.origin,
      });

      if (handoffAt !== null && now - handoffAt >= HANDOFF_MS) {
        finished.current = true;
        cancelAnimationFrame(id);
        state.onDone();
      }
    };
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", resize);
    };
  }, [animated]);

  return (
    <div className="transition" data-phase={phase} onPointerDown={leave}>
      <div className="transition-veil" />
      {animated && <canvas ref={canvas} aria-hidden="true" />}
      <div className="transition-text">
        <p className="transition-status" role="status" aria-live="polite">
          {TRANSITION.loading}
        </p>
        {mode !== "pending" && <p className="transition-skip">{TRANSITION.skip}</p>}
      </div>
    </div>
  );
}

function slotLabels(slot: Slot, layout: { count: number; spacing: number }): string[] | null {
  if (slot.kind === "pending") return null;
  const base = slot.kind === "live" ? slot.slot : ILLUSTRATIVE_SLOT;
  // On a narrow screen there is only room for the number.
  const format = layout.spacing < 130 ? TRANSITION.slotShort : TRANSITION.slot;
  return Array.from({ length: layout.count }, (_, index) => format(base + index));
}

/** Where the land scene's opening frame sits on screen right now. */
function landingCorners(meta: LandMeta | null): Point[] | null {
  const stage = document.querySelector("[data-land-stage]");
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const dims = blockDims(meta);
  const project = stageProjector(rect.width, rect.height, dims);
  return boxCorners(dims).map((corner) => {
    const scaled: Vec3 = [corner[0] * LANDING_SCALE, corner[1] * LANDING_SCALE, corner[2] * LANDING_SCALE];
    const point = project(scaled);
    return { x: rect.left + point.x, y: rect.top + point.y };
  });
}
