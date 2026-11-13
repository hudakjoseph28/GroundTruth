import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import {
  buildMesh,
  CITIES,
  HUB,
  PALETTE,
  randomTransaction,
  ringFor,
  type City,
  type GlobeArc,
  type GlobeRing,
  type MeshEdge,
} from "../globe/scene";

const MESH = buildMesh();

// A flat charcoal texture, so the planet reads as a lit dark sphere instead of a void.
function surfaceTexture(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1b1d21";
    ctx.fillRect(0, 0, 2, 2);
  }
  return canvas.toDataURL("image/png");
}

interface CountryFeature {
  type: "Feature";
  properties: { ADMIN?: string; NAME?: string };
  geometry: object;
}

// Timing for the illustrative transaction stream.
const SPAWN_EVERY_MS = 320;
const FLIGHT_MS = 2200;
const RING_MS = 1400;
const MAX_ARCS = 40;

const HUB_RING: GlobeRing = {
  id: -1,
  lat: HUB.lat,
  lng: HUB.lng,
  color: PALETTE.gold,
};

export function NetworkGlobe() {
  const frame = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hovered, setHovered] = useState<CountryFeature | null>(null);
  const [arcs, setArcs] = useState<GlobeArc[]>([]);
  const [rings, setRings] = useState<GlobeRing[]>([HUB_RING]);
  const [surface] = useState(surfaceTexture);

  // Fit the canvas to its container.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width < 1 || height < 1) return;
      setSize({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Country shapes (Natural Earth 1:110m, public domain).
  useEffect(() => {
    let cancelled = false;
    fetch("/data/countries.geojson")
      .then((response) => response.json())
      .then((data: { features: CountryFeature[] }) => {
        if (!cancelled) setCountries(data.features);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Camera: start over North America, slow auto-rotate, drag to explore.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView({ lat: 30, lng: -60, altitude: 2.3 }, 0);
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    frame.current?.querySelector("canvas")?.setAttribute("tabindex", "-1");
  }, [size]);

  // Pause rotation while someone hovers a country, so it's easy to inspect.
  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = hovered === null;
  }, [hovered]);

  // Illustrative transaction stream: spawn an arc, then ripple at its landing point.
  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      const arc = randomTransaction();
      setArcs((current) => [...current, arc].slice(-MAX_ARCS));
      later(() => {
        setArcs((current) => current.filter((item) => item.id !== arc.id));
        const ring = ringFor(arc);
        setRings((current) => [...current, ring]);
        later(
          () =>
            setRings((current) => current.filter((item) => item.id !== ring.id)),
          RING_MS,
        );
      }, FLIGHT_MS);
    }, SPAWN_EVERY_MS);
    return () => {
      window.clearInterval(interval);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div
      ref={frame}
      className="webgl-globe"
      data-globe="webgl"
      aria-hidden="true"
    >
      {size ? (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          showGlobe
          globeImageUrl={surface}
          showAtmosphere
          atmosphereColor="#b8b8b8"
          atmosphereAltitude={0.16}
          // Neural-net scaffolding: thin node-to-node lines across the whole sphere.
          pathsData={MESH}
          pathPoints={(edge) => (edge as MeshEdge).points}
          pathPointLat={(point) => (point as [number, number])[0]}
          pathPointLng={(point) => (point as [number, number])[1]}
          pathPointAlt={0.002}
          pathColor={() => "rgba(200, 205, 215, 0.16)"}
          pathStroke={null}
          pathTransitionDuration={0}
          // Countries drawn as a field of dots.
          hexPolygonsData={countries}
          hexPolygonResolution={3}
          hexPolygonMargin={0.62}
          hexPolygonUseDots
          hexPolygonAltitude={0.004}
          hexPolygonColor={(feature) =>
            feature === hovered ? PALETTE.dotHover : PALETTE.dot
          }
          // Invisible country caps for hover and labels.
          polygonsData={countries}
          polygonAltitude={(feature) => (feature === hovered ? 0.012 : 0.006)}
          polygonCapColor={(feature) =>
            feature === hovered ? "rgba(196, 161, 90, 0.12)" : "rgba(0,0,0,0)"
          }
          polygonSideColor={() => "rgba(0,0,0,0)"}
          polygonStrokeColor={(feature) =>
            feature === hovered ? PALETTE.gold : PALETTE.border
          }
          polygonCapCurvatureResolution={5}
          polygonLabel={(feature) => countryName(feature as CountryFeature)}
          onPolygonHover={(feature) =>
            setHovered((feature as CountryFeature | null) ?? null)
          }
          polygonsTransitionDuration={200}
          // City nodes.
          pointsData={CITIES}
          pointLat="lat"
          pointLng="lng"
          pointColor={(city) =>
            (city as City) === HUB ? PALETTE.gold : PALETTE.transfer
          }
          pointAltitude={0.01}
          pointRadius={(city) => ((city as City) === HUB ? 0.55 : 0.3)}
          pointLabel={(city) => `${(city as City).name} · illustrative`}
          // Transactions in flight.
          arcsData={arcs}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor="color"
          arcLabel="label"
          arcAltitudeAutoScale={0.4}
          arcStroke={(arc) => ((arc as GlobeArc).kind === "transfer" ? 0.7 : 1.05)}
          arcDashLength={0.55}
          arcDashGap={2}
          arcDashInitialGap={1}
          arcDashAnimateTime={FLIGHT_MS}
          arcsTransitionDuration={0}
          // Landing ripples, plus the persistent gold "being viewed" ring over Ohio.
          ringsData={rings}
          ringLat="lat"
          ringLng="lng"
          ringColor={(ring: object) => (t: number) =>
            fade((ring as GlobeRing).color, 1 - t)
          }
          ringMaxRadius={(ring) => ((ring as GlobeRing).id === -1 ? 3.2 : 2)}
          ringPropagationSpeed={(ring) =>
            (ring as GlobeRing).id === -1 ? 1 : 2.5
          }
          ringRepeatPeriod={(ring) =>
            (ring as GlobeRing).id === -1 ? 2200 : RING_MS
          }
        />
      ) : null}
      <p className="globe-caption">Illustrative activity, not live transactions.</p>
    </div>
  );
}

function countryName(feature: CountryFeature): string {
  return feature.properties.ADMIN ?? feature.properties.NAME ?? "";
}

/** Apply an alpha to a hex or rgba color string. */
function fade(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${a})`);
}
