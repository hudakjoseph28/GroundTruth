import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { MeshBasicMaterial } from "three";
import { buildLayers } from "./layers";
import { networkFor } from "./network";
import { usePageHidden } from "../parcel/usePageHidden";
import { PALETTE } from "./palette";
import { useCountries } from "./useCountries";
import { altitudeFor, GLOBE_VIEW, pixelRatioFor, zoomFor } from "./view";

// The globe sways around its opening view instead of spinning all the way
// round, so the Ohio hub never rotates out of sight behind the page content.
const SWAY_DEGREES = 5;
const SWAY_PERIOD_SECONDS = 80;
// On a low budget the globe draws about this often, leaving the rest of each
// second to whichever scene is in front of it.
const LOW_FRAME_MS = 1000 / 30;
// The globe's own loop draws for this long first: it finishes setting the
// scene up in its first frames, and a globe taken over before then is blank.
const SETTLE_MS = 700;
// OrbitControls turns 6 degrees per second at autoRotateSpeed 1.
const SWAY_SPEED = (SWAY_DEGREES * 2 * Math.PI) / SWAY_PERIOD_SECONDS / 6;

const EMPTY: object[] = [];
const layerObject = (d: object) => (d as { object: import("three").Object3D }).object;
const keepObject = () => undefined;

export type GlobeBudget = "full" | "low";

/**
 * The moving globe. It is scenery: nothing in it can be grabbed, and it only
 * draws while it is on screen and the tab is showing. On a "low" budget (the
 * page asks for that while another WebGL scene is animating in front of it)
 * it keeps moving, at about half the frames.
 */
export function NetworkGlobe({ budget = "full" }: { budget?: GlobeBudget }) {
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

  // Rest while offscreen or in a background tab.
  const hidden = usePageHidden();
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const watcher = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true));
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);
  const sized = size !== null;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!layers || !sized) return;
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [layers, sized]);
  const resting = settled && (hidden || !onScreen);
  const low = settled && budget === "low";

  // Pulses and the hub's breathing run on the GPU; this advances the clock and
  // the sway. The clock counts running time, so nothing jumps after a rest. On
  // a low budget the globe's own render loop is off and this draws the frames.
  const seconds = useRef(0);
  useEffect(() => {
    if (!layers || resting) return;
    let id = 0;
    let last: number | null = null;
    let drawnAt = -Infinity;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      const globe = globeRef.current;
      if (low && now - drawnAt < LOW_FRAME_MS - 2) return;
      seconds.current += last === null ? 0 : Math.min(100, now - last) / 1000;
      last = now;
      drawnAt = now;
      layers.tick(seconds.current);
      const controls = globe?.controls();
      if (controls) {
        const phase = (seconds.current / SWAY_PERIOD_SECONDS) * 2 * Math.PI;
        // autoRotate turns a fixed angle per update, so fewer updates need bigger steps.
        controls.autoRotateSpeed = SWAY_SPEED * Math.cos(phase) * (low ? 2 : 1);
      }
      if (low && globe) {
        controls?.update();
        globe.postProcessingComposer().render();
      }
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [layers, resting, low]);

  // The globe's own render loop runs only on a full budget.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !sized) return;
    if (resting || low) globe.pauseAnimation();
    else globe.resumeAnimation();
  }, [resting, low, sized]);

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

  // Camera: a slow sway and nothing to grab. On resize, only refit the distance.
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
    layers?.setPixelRatio(ratio * zoomFor(size.width));
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;
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
