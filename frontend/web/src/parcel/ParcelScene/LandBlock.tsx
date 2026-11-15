import { lazy, Suspense, useEffect, useMemo, type ReactNode } from "react";
import type { Parcel } from "@groundtruth/shared";
import { ParcelBoundary } from "../../components/ParcelBoundary";
import { LAND, PARCEL_PAGE } from "../../content/parcel";
import { SceneBoundary } from "../SceneBoundary";
import type { RenderMode } from "../useRenderMode";
import { EXAGGERATION } from "./blockFrame";
import { FlatLand } from "./FlatLand";
import type { LandAssets } from "./landAssets";
import { outerRing } from "./landMeta";

// three.js and the scene load as their own chunk, after the page has painted.
const LandBlockScene = lazy(() =>
  import("./LandBlockScene").then((module) => ({ default: module.LandBlockScene })),
);

/**
 * The parcel as a block of land. Picks the richest version the browser and
 * the visitor's settings allow, and says where the picture comes from.
 */
export function LandBlock({
  parcel,
  assets,
  mode,
  staged,
  revealed,
  onReady,
}: {
  parcel: Parcel;
  /** True when the boundary is the demo's stand-in, so the caption says so. */
  staged: boolean;
  /** undefined while loading, null when nothing is baked for this parcel. */
  assets: LandAssets | null | undefined;
  mode: RenderMode;
  revealed: boolean;
  /** Called once something is drawn, so the transition knows it can hand off. */
  onReady: () => void;
}) {
  const ring = useMemo(() => outerRing(parcel.geometry.geojson), [parcel]);
  const loading = assets === undefined || mode === "pending";
  const flat = !loading && assets !== null && mode !== "webgl";
  const drawable = assets && ring.length >= 3;

  // The 3D scene reports its own first frame; everything else is ready at once.
  const immediate = !loading && (!drawable || flat);
  useEffect(() => {
    if (immediate) onReady();
  }, [immediate, onReady]);

  if (loading) {
    return (
      <figure className="land">
        <div className="land-stage" data-land-stage>
          <p className="visually-hidden">{LAND.loading}</p>
        </div>
      </figure>
    );
  }

  // Nothing baked for this parcel: the plain boundary drawing still works.
  if (!drawable) return <ParcelBoundary geometry={parcel.geometry} />;

  const flatLand = <FlatLand assets={assets} ring={ring} />;
  const { meta } = assets;

  return (
    <figure className="land">
      <div className="land-stage" data-land-stage>
        {flat ? (
          flatLand
        ) : (
          <SceneBoundary fallback={<FlatLandReady onReady={onReady}>{flatLand}</FlatLandReady>}>
            <Suspense fallback={null}>
              <LandBlockScene assets={assets} ring={ring} revealed={revealed} onReady={onReady} />
            </Suspense>
          </SceneBoundary>
        )}
      </div>
      <figcaption>
        {!flat && <p className="visually-hidden">{LAND.label3d}</p>}
        <p>
          {meta.imagery.attribution} · {meta.elevation.attribution}
          {!flat && <> · {LAND.exaggerated(EXAGGERATION)}</>}
        </p>
        <p>
          {staged && <>{PARCEL_PAGE.stagedNote} </>}
          {flat ? (mode === "reduced" ? LAND.flat.reduced : LAND.flat.fallback) : LAND.hint}
        </p>
      </figcaption>
    </figure>
  );
}

/** The flat picture standing in for a scene that failed; it still has to report in. */
function FlatLandReady({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return children;
}
