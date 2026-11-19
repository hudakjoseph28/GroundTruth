import type { ParcelArea, ParcelOutline } from "@groundtruth/shared";
import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Segmented } from "../components/Segmented";
import { EXPLORE_MAP } from "../content/explore";
import { getParcelArea, type Bbox } from "../data/parcelSource";
import { usePageTitle } from "../layout/usePageTitle";
import { AreaSearch, type MapView } from "./AreaSearch";
import { contains, containsPoint, requestBox, VIEW_PADDING } from "./bbox";
import {
  BASEMAP_LAYERS,
  exploreStyle,
  MAX_BOUNDS,
  MIN_PARCEL_ZOOM,
  OHIO_BOUNDS,
  OUTLINE_PAINT,
  parcelFeatures,
  selectedFeatures,
  type Basemap,
} from "./mapStyle";
import { ParcelCard, type ParcelSummary } from "./ParcelCard";
import "./explore.css";

// MapLibre finds its worker beside its own module, which Vite's bundling
// moves; name the worker file directly so dev and the build both find it.
setWorkerUrl(maplibreWorkerUrl);

/** Wait this long after the map stops before asking for its parcels. */
const SETTLE_MS = 250;
/** Where a picked parcel is shown. */
const PICK_ZOOM = 17;

const BASEMAP_OPTIONS = (["imagery", "streets"] as const).map((value) => ({
  value,
  label: EXPLORE_MAP.basemaps[value],
}));

type Phase =
  | { kind: "zoomOut" }
  | { kind: "loading" }
  | { kind: "ready"; inView: number; truncated: boolean; shown: number }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string; retryable: boolean };

/**
 * A full-screen map of Ohio. From zoom 15 in, it draws the published outline
 * of every parcel in view, asked for through the API as the map moves. A tap
 * on a parcel opens its card; the card opens its report.
 */
export default function ExplorePage() {
  usePageTitle(EXPLORE_MAP.title);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "zoomOut" });
  const [selected, setSelected] = useState<{ parcel: ParcelSummary; fromSearch: boolean } | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("imagery");
  const [areaVersion, setAreaVersion] = useState(0);
  const [backTo, setBackTo] = useState("/explore");

  const loaded = useRef<{ area: ParcelArea; zoom: number } | null>(null);
  const byKey = useRef(new Map<string, ParcelOutline>());
  const inflight = useRef<AbortController | null>(null);

  /** Ask for the view's parcels unless the last answer already covers it. */
  const refresh = useCallback(function refresh(force = false, padding?: number) {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    // The view lives in the address (#at=zoom/lat/lng), so Back from a
    // report, a reload, or a shared link opens the same place. MapLibre's own
    // hash option is not used: it strips the address when the map is removed.
    const here = exploreUrl(map);
    if (window.location.pathname === "/explore") {
      window.history.replaceState(window.history.state, "", here);
    }
    setBackTo(here);
    if (zoom < MIN_PARCEL_ZOOM) {
      inflight.current?.abort();
      inflight.current = null;
      setPhase({ kind: "zoomOut" });
      return;
    }
    const view = viewBbox(map);
    const last = loaded.current;
    // A cut-off answer is asked again once the visitor zooms in further.
    if (
      !force &&
      last &&
      contains(last.area.bbox, view) &&
      (!last.area.truncated || zoom <= last.zoom + 0.5)
    ) {
      setPhase(readyPhase(last.area, view));
      return;
    }

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setPhase({ kind: "loading" });
    // Room around the view, unless this place already holds more parcels than one answer.
    const pad = padding ?? (last?.area.truncated ? 0 : VIEW_PADDING);
    getParcelArea(requestBox(view, pad), controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        inflight.current = null;
        if (outcome.status === "found") {
          loaded.current = { area: outcome.area, zoom };
          byKey.current = new Map(outcome.area.parcels.map((parcel) => [parcel.key, parcel]));
          map.getSource<GeoJSONSource>("parcels")?.setData(parcelFeatures(outcome.area.parcels));
          setAreaVersion((n) => n + 1);
          setPhase(readyPhase(outcome.area, viewBbox(map)));
          // Too many for the padded box: ask once more for the view alone.
          if (outcome.area.truncated && pad > 0) refresh(true, 0);
        } else if (outcome.status === "refused") {
          setPhase({ kind: "refused", message: outcome.message });
        } else {
          setPhase({ kind: "error", message: outcome.message, retryable: outcome.retryable });
        }
      },
      () => {
        // Aborted: the map moved on.
      },
    );
  }, []);

  // The map, once.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const saved = viewFromHash(window.location.hash);
    const map = new MapLibreMap({
      container: node,
      style: exploreStyle("imagery"),
      // A view in the address (Back from a report) wins over all of Ohio.
      ...(saved
        ? { center: saved.center, zoom: saved.zoom }
        : { bounds: OHIO_BOUNDS, fitBoundsOptions: { padding: 24 } }),
      maxBounds: MAX_BOUNDS,
      maxZoom: 20,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        fitBoundsOptions: { maxZoom: PICK_ZOOM },
      }),
      "bottom-right",
    );

    let settle: ReturnType<typeof setTimeout> | undefined;
    const onMoveEnd = () => {
      clearTimeout(settle);
      settle = setTimeout(() => refresh(), SETTLE_MS);
    };

    let hovered: string | null = null;
    const setHover = (key: string | null) => {
      if (hovered === key) return;
      if (hovered) map.setFeatureState({ source: "parcels", id: hovered }, { hover: false });
      hovered = key;
      if (key) map.setFeatureState({ source: "parcels", id: key }, { hover: true });
      map.getCanvas().style.cursor = key ? "pointer" : "";
    };
    const onHover = (event: MapLayerMouseEvent) => {
      const key = event.features?.[0]?.properties.key;
      setHover(typeof key === "string" ? key : null);
    };
    const onLeave = () => setHover(null);

    const onClick = (event: MapMouseEvent) => {
      if (map.getZoom() < MIN_PARCEL_ZOOM) return;
      const hit = map.queryRenderedFeatures(event.point, { layers: ["parcels-fill"] })[0];
      const key = hit?.properties.key;
      const parcel = typeof key === "string" ? byKey.current.get(key) : undefined;
      setSelected(parcel ? { parcel, fromSearch: false } : null);
    };

    map.on("load", () => refresh());
    map.on("moveend", onMoveEnd);
    map.on("mousemove", "parcels-fill", onHover);
    map.on("mouseleave", "parcels-fill", onLeave);
    map.on("click", onClick);

    return () => {
      clearTimeout(settle);
      inflight.current?.abort();
      mapRef.current = null;
      map.remove();
    };
  }, [refresh]);

  // The selected parcel's outline, in gold, once its area has loaded.
  useEffect(() => {
    const map = mapRef.current;
    const outline = selected ? byKey.current.get(selected.parcel.key)?.outline : undefined;
    const source = map?.getSource<GeoJSONSource>("selected");
    source?.setData(selectedFeatures(outline));
  }, [selected, areaVersion]);

  // The basemap and an outline color that reads on it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const [option, layers] of Object.entries(BASEMAP_LAYERS)) {
        for (const layer of layers) {
          map.setLayoutProperty(layer, "visibility", option === basemap ? "visible" : "none");
        }
      }
      const paint = OUTLINE_PAINT[basemap];
      map.setPaintProperty("parcels-line", "line-color", paint.line);
      map.setPaintProperty("parcels-fill", "fill-color", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        paint.hover,
        paint.fill,
      ]);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [basemap]);

  const closeCard = useCallback(() => setSelected(null), []);

  const readView = useCallback((): MapView | null => {
    const map = mapRef.current;
    if (!map) return null;
    const center = map.getCenter();
    return { bbox: viewBbox(map), center: { latitude: center.lat, longitude: center.lng } };
  }, []);

  const drawn = useCallback(() => [...byKey.current.values()], []);

  const onPick = useCallback((parcel: ParcelSummary) => {
    setSelected({ parcel, fromSearch: true });
    const map = mapRef.current;
    if (!map) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({
      center: [parcel.centroid.longitude, parcel.centroid.latitude],
      zoom: Math.max(map.getZoom(), PICK_ZOOM),
      animate: !reduce,
      // Across the state, a long flight is waiting, not information.
      maxDuration: 2_000,
    });
  }, []);

  function zoomIn() {
    mapRef.current?.easeTo({ zoom: MIN_PARCEL_ZOOM });
  }

  return (
    <div className="explore-page">
      <h1 className="visually-hidden">{EXPLORE_MAP.title}</h1>
      <div ref={container} className="explore-map" role="region" aria-label={EXPLORE_MAP.mapLabel} />

      <div className="explore-top">
        <AreaSearch view={readView} drawn={drawn} onPick={onPick} />
        <StatusPill phase={phase} onZoomIn={zoomIn} onRetry={() => refresh(true)} />
      </div>

      <div className="explore-basemap">
        <Segmented
          label={EXPLORE_MAP.basemapLabel}
          value={basemap}
          options={BASEMAP_OPTIONS}
          onChange={setBasemap}
        />
      </div>

      {selected ? (
        <ParcelCard
          parcel={selected.parcel}
          backTo={backTo}
          takeFocus={selected.fromSearch}
          onClose={closeCard}
        />
      ) : null}
    </div>
  );
}

function StatusPill({
  phase,
  onZoomIn,
  onRetry,
}: {
  phase: Phase;
  onZoomIn: () => void;
  onRetry: () => void;
}) {
  let body: ReactNode;
  let tone = "";
  switch (phase.kind) {
    case "zoomOut":
      body = (
        <>
          <span>{EXPLORE_MAP.zoomIn}</span>
          <button type="button" className="btn btn-small" onClick={onZoomIn}>
            {EXPLORE_MAP.zoomInAction}
          </button>
        </>
      );
      break;
    case "loading":
      body = (
        <>
          <span className="explore-spinner" aria-hidden="true" />
          <span>{EXPLORE_MAP.loading}</span>
        </>
      );
      break;
    case "ready":
      body = (
        <span>
          {phase.truncated
            ? EXPLORE_MAP.truncated(phase.shown)
            : phase.inView === 0
              ? EXPLORE_MAP.none
              : EXPLORE_MAP.count(phase.inView)}
        </span>
      );
      break;
    case "refused":
      body = <span>{phase.message}</span>;
      break;
    case "error":
      tone = "is-error";
      body = (
        <>
          <span>{phase.message}</span>
          {phase.retryable ? (
            <button type="button" className="btn btn-small" onClick={onRetry}>
              {EXPLORE_MAP.retry}
            </button>
          ) : null}
        </>
      );
      break;
  }
  return (
    <div className={`explore-status ${tone}`} role="status">
      {body}
    </div>
  );
}

function viewBbox(map: MapLibreMap): Bbox {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function readyPhase(area: ParcelArea, view: Bbox): Phase {
  const inView = area.parcels.filter((parcel) => containsPoint(view, parcel.centroid)).length;
  return { kind: "ready", inView, truncated: area.truncated, shown: area.parcels.length };
}

/** The view in an `#at=zoom/lat/lng` hash, or null when there is none. */
function viewFromHash(hash: string): { center: [number, number]; zoom: number } | null {
  const match = /^#at=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(hash);
  if (!match) return null;
  const [zoom, lat, lng] = match.slice(1).map(Number) as [number, number, number];
  if (zoom > 22 || Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;
  return { center: [lng, lat], zoom };
}

/** This view's address, in the same form as the map's own `#at=` hash. */
function exploreUrl(map: MapLibreMap): string {
  const center = map.getCenter();
  const zoom = Math.round(map.getZoom() * 100) / 100;
  return `/explore#at=${zoom}/${center.lat.toFixed(5)}/${center.lng.toFixed(5)}`;
}
