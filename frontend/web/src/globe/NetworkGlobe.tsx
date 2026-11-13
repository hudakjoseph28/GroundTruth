import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { MeshBasicMaterial } from "three";
import { buildLayers } from "./layers";
import { networkFor } from "./network";
import { PALETTE } from "./palette";
import { useCountries } from "./useCountries";

// Start over North America with South America in view below.
export const INITIAL_VIEW = { lat: 27, lng: -84, altitude: 1.66 } as const;

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

  // Pulses and the hub's breathing run on the GPU; this only advances the clock.
  useEffect(() => {
    if (!layers) return;
    let id = 0;
    const loop = (now: number) => {
      layers.tick(now / 1000);
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

  // Camera: slow auto-rotate, drag to explore, no zoom or pan.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView(INITIAL_VIEW, 0);
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.22;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    frame.current?.querySelector("canvas")?.setAttribute("tabindex", "-1");
  }, [size]);

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
      <p className="globe-caption">Illustrative activity, not live transactions.</p>
    </div>
  );
}
