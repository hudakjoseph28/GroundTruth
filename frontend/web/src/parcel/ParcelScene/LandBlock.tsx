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
import { Segmented } from "../../components/Segmented";
import { ParcelBoundary } from "../../components/ParcelBoundary";
import { LAND, PARCEL_PAGE } from "../../content/parcel";
import { ExploreMenu } from "../Explore/ExploreMenu";
import { GOOGLE_MAPS_KEY } from "../Explore/links";
import { SceneBoundary } from "../SceneBoundary";
import type { RenderMode } from "../useRenderMode";
import { EXAGGERATION } from "./blockFrame";
import { FlatLand } from "./FlatLand";
import { FlatLandView } from "./FlatLandView";
import type { LandAssets } from "./landAssets";
import type { Turn } from "./LandBlockScene";
import { outerRing } from "./landMeta";
import { useLandView } from "./useLandView";

const LandBlockScene = lazy(() =>
  import("./LandBlockScene").then((module) => ({ default: module.LandBlockScene })),
);
const AreaView3D = lazy(() => import("../Explore/AreaView3D"));

const KEY_TURN = 0.14;
const KEY_TILT = 0.08;

/**
 * The parcel as a block of land. Picks 3D or 2D from the visitor's choice
 * (remembered), falls back to 2D when motion is reduced or WebGL is gone, and
 * opens the way out to the real surroundings.
 */
export function LandBlock({
  parcel,
  assets,
  building = false,
  mode,
  staged,
  revealed,
  onReady,
}: {
  parcel: Parcel;
  staged: boolean;
  assets: LandAssets | null | undefined;
  /** The API is building the land block (the parcel is not baked). */
  building?: boolean;
  mode: RenderMode;
  revealed: boolean;
  onReady: () => void;
}) {
  const ring = useMemo(() => outerRing(parcel.geometry.geojson), [parcel]);
  const loading = assets === undefined || mode === "pending";
  const drawable = Boolean(assets && ring.length >= 3);
  const { view, setView, threeDisabled } = useLandView(mode);
  const show3d = !loading && drawable && view === "3d" && !threeDisabled;
  const show2d = !loading && drawable && !show3d;

  const immediate = !loading && (!drawable || show2d);
  useEffect(() => {
    if (immediate) onReady();
  }, [immediate, onReady]);

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
    (stage.current ?? button.current)?.focus();
  }, []);

  const onStageKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFromLand();
      return;
    }
    if (!show3d) return;
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

  const viewToggle = drawable && (
    <div className="land-view">
      <Segmented
        label={LAND.view.label}
        value={show3d ? "3d" : "2d"}
        options={[
          {
            value: "3d",
            label: LAND.view.three,
            disabled: threeDisabled,
            hint: threeDisabled
              ? mode === "reduced"
                ? LAND.view.reduced
                : LAND.view.noWebgl
              : undefined,
          },
          { value: "2d", label: LAND.view.two },
        ]}
        onChange={setView}
      />
    </div>
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
        <div className="land-stage" data-land-stage data-building={building || undefined}>
          {building ? (
            <p className="land-building" role="status">
              {LAND.building}
            </p>
          ) : (
            <p className="visually-hidden">{LAND.loading}</p>
          )}
        </div>
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

  if (!drawable || !assets) {
    return (
      <div className="land">
        <ParcelBoundary geometry={parcel.geometry} />
        <div className="land-caption">
          {assets === null && ring.length >= 3 && (
            <div className="land-credit">
              <p data-land-unavailable>{LAND.unavailable}</p>
            </div>
          )}
          {explore}
        </div>
        {areaView}
      </div>
    );
  }

  const { meta } = assets;
  const flatHint =
    mode === "reduced" ? LAND.flat.reduced : mode === "fallback" ? LAND.flat.fallback : LAND.flat.chosen;

  return (
    <figure className="land">
      <div className="land-frame">
        {viewToggle}
        <div
          ref={stage}
          className="land-stage"
          data-land-stage
          data-flat={show2d || undefined}
          data-view={show3d ? "3d" : "2d"}
          role="button"
          tabIndex={0}
          aria-label={show3d ? LAND.stage.turning : LAND.stage.still}
          aria-haspopup="true"
          aria-expanded={menu !== null}
          onKeyDown={onStageKey}
          onClick={show2d ? openFromLand : undefined}
        >
          <div className="land-swap" data-showing={show3d ? "3d" : "2d"}>
            <div className="land-pane" data-pane="3d" hidden={!show3d}>
              {show3d && (
                <SceneBoundary
                  fallback={
                    <FlatLandReady onReady={onReady}>
                      <FlatLand assets={assets} ring={ring} />
                    </FlatLandReady>
                  }
                >
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
            <div className="land-pane" data-pane="2d" hidden={!show2d}>
              {show2d && <FlatLandView assets={assets} ring={ring} />}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="land-caption">
        <div className="land-credit">
          <p className="visually-hidden">{show3d ? LAND.label3d : LAND.labelFlat}</p>
          <p>
            {meta.imagery.attribution} · {meta.elevation.attribution}
            {show3d && <> · {LAND.exaggerated(EXAGGERATION)}</>}
          </p>
          <p>
            {staged && <>{PARCEL_PAGE.stagedNote} </>}
            {show3d ? LAND.hint : flatHint}
          </p>
        </div>
        {explore}
      </figcaption>
      {areaView}
    </figure>
  );
}

function FlatLandReady({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return children;
}
