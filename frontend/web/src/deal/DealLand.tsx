import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { DealState, Parcel } from "@groundtruth/shared";
import { DEAL_LAND } from "../content/deal";
import { LAND } from "../content/parcel";
import { EXAGGERATION } from "../parcel/ParcelScene/blockFrame";
import { FlatLand } from "../parcel/ParcelScene/FlatLand";
import type { LandHandle } from "../parcel/ParcelScene/LandBlockScene";
import { outerRing, regionUV } from "../parcel/ParcelScene/landMeta";
import { useLandAssets } from "../parcel/ParcelScene/useLandAssets";
import { SceneBoundary } from "../parcel/SceneBoundary";
import { useRenderMode } from "../parcel/useRenderMode";
import { landTone, ringCentroid, shouldRipple } from "./landRules";

// three.js loads only when the visitor's browser will draw the block in 3D.
const LandBlockScene = lazy(() =>
  import("../parcel/ParcelScene/LandBlockScene").then((module) => ({
    default: module.LandBlockScene,
  })),
);

/** The block sits this many pixels below the middle of its small frame. */
const TABLE_OFFSET = 14;

/**
 * The deal's parcel as a small block of land: the homepage's scene, resting on
 * its ground sheet. The boundary carries the deal's confirmed state: red with a
 * lock while a hold blocks the payout, green once it is released. When the
 * deal turns released while the page is open, the release ripple laps the
 * boundary once. Flat and still when motion is reduced or WebGL is missing.
 *
 * Decorative: the hero states the status in words. Loaded lazily by the deal
 * page, so none of this holds up the amount or the status.
 */
export default function DealLand({
  parcel,
  state,
  liveState,
}: {
  parcel: Parcel;
  state: DealState;
  /** Set once the deal's state changed while the page was open. */
  liveState: DealState | null;
}) {
  const mode = useRenderMode();
  const { assets } = useLandAssets(parcel);
  const ring = useMemo(() => outerRing(parcel.geometry.geojson), [parcel]);
  const center = useMemo(() => {
    if (!assets) return null;
    return ringCentroid(
      ring.map((pair) =>
        regionUV(assets.meta.bbox, pair[0] ?? 0, pair[1] ?? 0),
      ),
    );
  }, [assets, ring]);

  const tone = landTone(state);
  const drawable = Boolean(assets && ring.length >= 3);
  const [failed, setFailed] = useState(false);
  const three = drawable && mode === "webgl" && !failed;
  const flat = drawable && !three && mode !== "pending";
  const [ready, setReady] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const lock = useRef<HTMLSpanElement>(null);
  const handle = useRef<LandHandle | null>(null);

  // The release ripple, once, when the deal turns released in front of the visitor.
  const rippled = useRef(false);
  const ripple = shouldRipple({
    liveState,
    ready: three && ready,
    animated: mode === "webgl",
  });
  useEffect(() => {
    if (!ripple || rippled.current) return;
    rippled.current = true;
    handle.current?.ripple();
  }, [ripple]);

  // The lock rides on the parcel's middle as the block sways.
  const pinned = tone === "held" && three && ready && center !== null;
  useEffect(() => {
    if (!pinned || !center) return;
    let id = 0;
    const follow = () => {
      id = requestAnimationFrame(follow);
      const box = stage.current?.getBoundingClientRect();
      const at = handle.current?.surface(center.u, center.v);
      const node = lock.current;
      if (!box || !at || !node) return;
      node.style.left = `${at.x - box.left}px`;
      node.style.top = `${at.y - box.top}px`;
    };
    id = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(id);
  }, [pinned, center]);

  // Nothing to draw for this parcel: the page goes on without the picture.
  if (assets === null || (assets && ring.length < 3)) return null;

  const seal = tone === "gold" ? null : tone;
  return (
    <figure
      className="deal-land"
      data-tone={tone}
      data-flat={flat || undefined}
    >
      <div
        ref={stage}
        className="deal-land-stage"
        aria-busy={!drawable || undefined}
      >
        {!drawable && <p className="visually-hidden">{DEAL_LAND.loading}</p>}
        {three && assets && (
          <SceneBoundary fallback={<Failed onFailed={() => setFailed(true)} />}>
            <Suspense fallback={null}>
              <LandBlockScene
                assets={assets}
                ring={ring}
                revealed
                handle={handle}
                interactive={false}
                cornerDots={false}
                staging="table"
                tone={tone}
                tableOffset={TABLE_OFFSET}
                onReady={() => setReady(true)}
              />
            </Suspense>
          </SceneBoundary>
        )}
        {flat && assets && <FlatLand assets={assets} ring={ring} tone={tone} />}
        {/* The hold's lock sits on the parcel, once it can be placed, so it never jumps. */}
        {seal === "held" && (flat || pinned) && (
          <span
            ref={lock}
            className="deal-land-lock"
            style={
              flat && center
                ? { left: `${center.u * 100}%`, top: `${center.v * 100}%` }
                : undefined
            }
            aria-hidden="true"
          >
            <LockIcon />
          </span>
        )}
      </div>
      {seal && drawable && (
        <p className="deal-land-seal" data-tone={seal} aria-hidden="true">
          {seal === "held" ? <LockIcon /> : <CheckIcon />}
          {DEAL_LAND.seal[seal]}
        </p>
      )}
      <figcaption className="deal-land-caption">
        <span className="visually-hidden">
          {DEAL_LAND.description(parcel.sourceParcelId)}{" "}
        </span>
        {seal && (
          <span className="visually-hidden">{DEAL_LAND.boundary[seal]} </span>
        )}
        {assets && (
          <span aria-hidden={!drawable || undefined}>
            {assets.meta.imagery.attribution} ·{" "}
            {assets.meta.elevation.attribution}
            {three && <> · {LAND.exaggerated(EXAGGERATION)}</>}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Tells the card that the scene could not draw, so it shows the flat picture. */
function Failed({ onFailed }: { onFailed: () => void }) {
  useEffect(() => {
    onFailed();
  }, [onFailed]);
  return null;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" />
      <rect x="2.5" y="7" width="11" height="7" rx="2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}
