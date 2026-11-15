import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Parcel } from "@groundtruth/shared";
import { ParcelBoundary } from "../../components/ParcelBoundary";
import { LAND, PARCEL_PAGE } from "../../content/parcel";
import { ExploreMenu } from "../Explore/ExploreMenu";
import { GOOGLE_MAPS_KEY } from "../Explore/links";
import { SceneBoundary } from "../SceneBoundary";
import type { RenderMode } from "../useRenderMode";
import { EXAGGERATION } from "./blockFrame";
import { FlatLand } from "./FlatLand";
import type { LandAssets } from "./landAssets";
import type { Turn } from "./LandBlockScene";
import { outerRing } from "./landMeta";

// three.js and the scene load as their own chunk, after the page has painted.
const LandBlockScene = lazy(() =>
  import("./LandBlockScene").then((module) => ({ default: module.LandBlockScene })),
);
// Google's 3D view is its own chunk too, fetched only if someone opens it.
const AreaView3D = lazy(() => import("../Explore/AreaView3D"));

/** How far one arrow-key press turns the block, in radians. */
const KEY_TURN = 0.14;
const KEY_TILT = 0.08;

/**
 * The parcel as a block of land. Picks the richest version the browser and
 * the visitor's settings allow, says where the picture comes from, and opens
 * the way out to the real surroundings.
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

  // "Explore the area" opens from the land itself or from the button under it.
  const stage = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const turn = useRef<Turn | null>(null);
  const [menu, setMenu] = useState<"land" | "button" | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);

  const openFromLand = useCallback(() => setMenu((opened) => opened ?? "land"), []);
  const closeMenu = useCallback(
    (refocus: boolean) => {
      if (refocus) (menu === "land" ? stage.current : button.current)?.focus();
      setMenu(null);
    },
    [menu],
  );
  const closeArea = useCallback(() => {
    setAreaOpen(false);
    // Back to the land block, or to the button when there is no block to focus.
    (stage.current ?? button.current)?.focus();
  }, []);

  const onStageKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFromLand();
      return;
    }
    const turns: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_TURN, 0],
      ArrowRight: [KEY_TURN, 0],
      ArrowUp: [0, -KEY_TILT],
      ArrowDown: [0, KEY_TILT],
    };
    const by = turns[event.key];
    if (by && turn.current) {
      event.preventDefault();
      turn.current(...by);
    }
  };

  const explore = (
    <ExploreMenu
      centroid={parcel.centroid}
      open={menu !== null}
      button={button}
      onToggle={() => setMenu(menu === null ? "button" : null)}
      onClose={closeMenu}
      onOpenArea={
        GOOGLE_MAPS_KEY
          ? () => {
              setMenu(null);
              setAreaOpen(true);
            }
          : undefined
      }
    />
  );
  const areaView = GOOGLE_MAPS_KEY && areaOpen && (
    <SceneBoundary fallback={null}>
      <Suspense fallback={null}>
        <AreaView3D
          apiKey={GOOGLE_MAPS_KEY}
          parcel={parcel}
          ring={ring}
          staged={staged}
          animate={mode !== "reduced"}
          onClose={closeArea}
        />
      </Suspense>
    </SceneBoundary>
  );

  if (loading) {
    return (
      <figure className="land">
        <div className="land-stage" data-land-stage>
          <p className="visually-hidden">{LAND.loading}</p>
        </div>
        {/* Same shape as the loaded caption, so nothing below moves when it fills in. */}
        <figcaption className="land-caption">
          <div className="land-credit" aria-hidden="true">
            <p>&nbsp;</p>
            <p>&nbsp;</p>
          </div>
          {explore}
        </figcaption>
      </figure>
    );
  }

  // Nothing baked for this parcel: the plain boundary drawing still works.
  if (!drawable) {
    return (
      <div className="land">
        <ParcelBoundary geometry={parcel.geometry} />
        <div className="land-caption">{explore}</div>
        {areaView}
      </div>
    );
  }

  const flatLand = <FlatLand assets={assets} ring={ring} />;
  const { meta } = assets;

  return (
    <figure className="land">
      {/* The land is a control too: click or Enter opens "Explore the area". */}
      <div
        ref={stage}
        className="land-stage"
        data-land-stage
        data-flat={flat || undefined}
        role="button"
        tabIndex={0}
        aria-label={flat ? LAND.stage.still : LAND.stage.turning}
        aria-haspopup="true"
        aria-expanded={menu !== null}
        onKeyDown={onStageKey}
        onClick={flat ? openFromLand : undefined}
      >
        {flat ? (
          flatLand
        ) : (
          <SceneBoundary fallback={<FlatLandReady onReady={onReady}>{flatLand}</FlatLandReady>}>
            <Suspense fallback={null}>
              <LandBlockScene
                assets={assets}
                ring={ring}
                revealed={revealed}
                turn={turn}
                onReady={onReady}
                onActivate={openFromLand}
              />
            </Suspense>
          </SceneBoundary>
        )}
      </div>
      <figcaption className="land-caption">
        <div className="land-credit">
          <p className="visually-hidden">{flat ? LAND.labelFlat : LAND.label3d}</p>
          <p>
            {meta.imagery.attribution} · {meta.elevation.attribution}
            {!flat && <> · {LAND.exaggerated(EXAGGERATION)}</>}
          </p>
          <p>
            {staged && <>{PARCEL_PAGE.stagedNote} </>}
            {flat ? (mode === "reduced" ? LAND.flat.reduced : LAND.flat.fallback) : LAND.hint}
          </p>
        </div>
        {explore}
      </figcaption>
      {areaView}
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
