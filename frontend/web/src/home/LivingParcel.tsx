import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { goldenParcel } from "@groundtruth/shared";
import { ATTESTATION_COPY, ATTESTATIONS, STILL_ATTESTATIONS } from "../content/attestations";
import { HERO } from "../content/home";
import { sampleParcelPath } from "../data/parcelSource";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";
import { blockOriginState } from "../parcel/BlockTransition/origin";
import { FlatLand } from "../parcel/ParcelScene/FlatLand";
import type { LandHandle, Probe } from "../parcel/ParcelScene/LandBlockScene";
import { outerRing, regionUV } from "../parcel/ParcelScene/landMeta";
import { useLandAssets } from "../parcel/ParcelScene/useLandAssets";
import { SceneBoundary } from "../parcel/SceneBoundary";
import { useRenderMode } from "../parcel/useRenderMode";
import { AttestationTags, type UV } from "./AttestationTags";

const LandBlockScene = lazy(() =>
  import("../parcel/ParcelScene/LandBlockScene").then((module) => ({ default: module.LandBlockScene })),
);

const warmSlot = () => void readDevnetSlot();
/** How much the block's sway slows while the cursor is over it. */
const HOVER_PACE = 0.22;

/** Spots inside the parcel, on a grid, for tags to be pinned to. */
function spotsInside(ring: readonly UV[]): UV[] {
  const inside = ({ u, v }: UV) => {
    let within = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (!a || !b) continue;
      if (a.v > v !== b.v > v && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v) + a.u) within = !within;
    }
    return within;
  };
  const spots: UV[] = [];
  const steps = 9;
  for (let row = 1; row < steps; row++) {
    for (let column = 1; column < steps; column++) {
      const spot = { u: column / steps, v: row / steps };
      if (inside(spot)) spots.push(spot);
    }
  }
  return spots.length > 0 ? spots : [{ u: 0.5, v: 0.5 }];
}

/** Room kept round the block when sizing its link, for the sway. */
const HIT_PAD = 6;

/**
 * The demo parcel as a block of land resting on a quiet ground sheet, with
 * tags pinned to spots on it. One component for the hero and the closing call
 * to action; the scene inside is the parcel page's land block.
 *
 * The block is a link to the demo parcel, and carries itself into the parcel
 * page's transition.
 */
export function LivingParcel({ variant }: { variant: "hero" | "compact" }) {
  const navigate = useNavigate();
  const mode = useRenderMode();
  const { assets } = useLandAssets(goldenParcel);
  const ring = useMemo(() => outerRing(goldenParcel.geometry.geojson), []);
  const spots = useMemo(() => {
    if (!assets) return [];
    return spotsInside(ring.map((pair) => regionUV(assets.meta.bbox, pair[0] ?? 0, pair[1] ?? 0)));
  }, [assets, ring]);

  const root = useRef<HTMLDivElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const probe = useRef<Probe | null>(null);
  const handle = useRef<LandHandle | null>(null);

  // The scene is built the first time the block comes near the screen.
  const [near, setNear] = useState(variant === "hero");
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const nearby = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin: "400px 0px" },
    );
    nearby.observe(node);
    return () => nearby.disconnect();
  }, []);

  const drawable = Boolean(assets && ring.length >= 3);
  const [failed, setFailed] = useState(false);
  const three = drawable && mode === "webgl" && near && !failed;
  const flat = drawable && !three && mode !== "pending" && (mode !== "webgl" || failed);
  const [ready, setReady] = useState(false);

  const locate = useCallback((u: number, v: number) => {
    if (handle.current) return handle.current.surface(u, v);
    const picture = root.current?.querySelector("[data-land='flat']");
    if (!picture) return null;
    const box = picture.getBoundingClientRect();
    if (box.width < 1) return null;
    return { x: box.left + u * box.width, y: box.top + v * box.height };
  }, []);

  // The link covers the block, wherever the scene has drawn it.
  useEffect(() => {
    const node = root.current;
    const anchor = link.current;
    if (!three || !ready || !node || !anchor) return;
    const fit = () => {
      const corners = probe.current?.();
      const box = node.getBoundingClientRect();
      if (!corners || box.width < 1) return;
      const xs = corners.map((corner) => corner.x - box.left);
      const ys = corners.map((corner) => corner.y - box.top);
      const left = Math.max(0, Math.min(...xs) - HIT_PAD);
      const top = Math.max(0, Math.min(...ys) - HIT_PAD);
      anchor.style.left = `${left}px`;
      anchor.style.top = `${top}px`;
      anchor.style.width = `${Math.min(box.width, Math.max(...xs) + HIT_PAD) - left}px`;
      anchor.style.height = `${Math.min(box.height, Math.max(...ys) + HIT_PAD) - top}px`;
    };
    fit();
    // Once more after the block has finished arriving.
    const timer = window.setTimeout(fit, 1200);
    const resizer = new ResizeObserver(fit);
    resizer.observe(node);
    return () => {
      window.clearTimeout(timer);
      resizer.disconnect();
      anchor.removeAttribute("style");
    };
  }, [three, ready]);

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    // A plain click carries the block along; anything else is the browser's.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(sampleParcelPath(), { state: blockOriginState(probe.current?.() ?? null) });
  };

  const tagsOn = drawable && (flat || (three && ready));

  return (
    <div ref={root} className="living" data-variant={variant} data-flat={flat || undefined}>
      <div className="living-stage">
        {three && assets && (
          <SceneBoundary fallback={<Failed onFailed={() => setFailed(true)} />}>
            <Suspense fallback={null}>
              <LandBlockScene
                assets={assets}
                ring={ring}
                revealed
                probe={probe}
                handle={handle}
                interactive={false}
                cornerDots={false}
                staging="table"
                onReady={() => setReady(true)}
              />
            </Suspense>
          </SceneBoundary>
        )}
        {flat && assets && <FlatLand assets={assets} ring={ring} />}
      </div>
      <Link
        ref={link}
        className="living-open"
        to={sampleParcelPath()}
        onClick={open}
        onPointerDown={warmSlot}
        onFocus={warmSlot}
        onPointerEnter={() => handle.current?.setPace(HOVER_PACE)}
        onPointerLeave={() => handle.current?.setPace(1)}
      >
        <span className="visually-hidden">
          {HERO.land.open}. {HERO.land.description}
        </span>
      </Link>
      {tagsOn && (
        <AttestationTags
          events={ATTESTATIONS}
          still={STILL_ATTESTATIONS}
          anchors={spots}
          locate={locate}
          animated={mode !== "reduced"}
          max={variant === "hero" ? 3 : 2}
          onRelease={() => handle.current?.ripple()}
        />
      )}
      {tagsOn && (
        <p className="living-caption" aria-hidden={variant === "hero" || undefined}>
          {ATTESTATION_COPY.caption}
        </p>
      )}
      {variant === "hero" && <p className="visually-hidden">{ATTESTATION_COPY.summary}</p>}
    </div>
  );
}

/** Tells the parcel that the scene could not draw, so it shows the flat picture. */
function Failed({ onFailed }: { onFailed: () => void }) {
  useEffect(() => {
    onFailed();
  }, [onFailed]);
  return null;
}
