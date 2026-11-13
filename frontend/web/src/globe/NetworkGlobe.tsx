import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { MeshBasicMaterial } from "three";
import { buildLayers } from "./layers";
import { networkFor } from "./network";
import { PALETTE } from "./palette";
import { useCountries } from "./useCountries";
import { altitudeFor, GLOBE_VIEW, pixelRatioFor } from "./view";

// The globe sways around its opening view instead of spinning all the way
// round, so the Ohio hub never rotates out of sight behind the page content.
const SWAY_DEGREES = 5;
const SWAY_PERIOD_SECONDS = 80;
// OrbitControls turns 6 degrees per second at autoRotateSpeed 1.
const SWAY_SPEED = (SWAY_DEGREES * 2 * Math.PI) / SWAY_PERIOD_SECONDS / 6;

const EMPTY: object[] = [];
const layerObject = (d: object) => (d as { object: import("three").Object3D }).object;
const keepObject = () => undefined;

export function NetworkGlobe() {
  const frame = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const countries = useCountries();
  const [surface] = useState(() => new MeshBasicMaterial({ color: PALETTE.surface }));

  // Built once, after the country shapes arrive: point clusters, web, rays, pulses.
  const layers = useMemo(() => {
    if (!countries.length) return null;
    return buildLayers(networkFor(countries), 100, Math.min(window.devicePixelRatio || 1, 2));
  }, [countries]);

  useEffect(() => () => layers?.dispose(), [layers]);
  useEffect(() => () => surface.dispose(), [surface]);

  // Pulses and the hub's breathing run on the GPU; this only advances the clock
  // and the sway.
  useEffect(() => {
    if (!layers) return;
    let id = 0;
    let start: number | null = null;
    const loop = (now: number) => {
      layers.tick(now / 1000);
      start ??= now;
      const controls = globeRef.current?.controls();
      if (controls) {
        const phase = ((now - start) / 1000 / SWAY_PERIOD_SECONDS) * 2 * Math.PI;
        controls.autoRotateSpeed = SWAY_SPEED * Math.cos(phase);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [layers]);

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

  // Camera: slow sway, drag to explore, no zoom or pan. On resize, keep where
  // the viewer has turned the globe and only refit the distance.
  const placed = useRef(false);
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !size) return;
    const altitude = altitudeFor(size.width, size.height);
    if (placed.current) {
      globe.pointOfView({ ...globe.pointOfView(), altitude }, 0);
    } else {
      globe.pointOfView({ ...GLOBE_VIEW, altitude }, 0);
      placed.current = true;
    }
    const ratio = pixelRatioFor(size.width, size.height);
    globe.renderer().setPixelRatio(ratio);
    layers?.setPixelRatio(ratio);
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    frame.current?.querySelector("canvas")?.setAttribute("tabindex", "-1");
  }, [size, layers]);

  return (
    <div ref={frame} className="webgl-globe" data-globe="webgl" aria-hidden="true">
      {size ? (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          showGlobe
          globeMaterial={surface}
          showAtmosphere
          atmosphereColor={PALETTE.rim}
          atmosphereAltitude={0.07}
          customLayerData={layers?.objects ?? EMPTY}
          customThreeObject={layerObject}
          customThreeObjectUpdate={keepObject}
        />
      ) : null}
    </div>
  );
}
