import { useEffect, useRef } from "react";
import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VIEW, cameraPosition, fitDistance } from "./blockFrame";
import { buildLandBlock } from "./buildBlock";
import type { LandAssets } from "./landAssets";

/** How long the gold frame takes to give way to the land, in milliseconds. */
const INTRO_MS = 900;
/** Degrees per second is this times six; one turn takes about two minutes. */
const ROTATE_SPEED = 0.5;

/**
 * The land block in WebGL. Decorative: the page describes the parcel in text.
 * Loaded lazily, so three.js never holds up the first paint.
 */
export function LandBlockScene({
  assets,
  ring,
  revealed,
  onReady,
}: {
  assets: LandAssets;
  ring: number[][];
  /** False while the transition covers the page; the hand-off starts when it turns true. */
  revealed: boolean;
  onReady?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const live = useRef({ revealed, onReady });
  useEffect(() => {
    live.current = { revealed, onReady };
  }, [revealed, onReady]);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.setAttribute("tabindex", "-1");
    node.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(VIEW.fov, 1, 0.1, 60);
    scene.add(camera);

    // Lit from the camera, studio style: a soft key over the viewer's shoulder
    // and a cool rim from behind, so every angle of the block reads.
    scene.add(new HemisphereLight("#ffffff", "#1c1712", 0.62));
    const key = new DirectionalLight("#fff4e2", 1.9);
    key.position.set(-2.2, 3.4, 1.6);
    const rim = new DirectionalLight("#cfd8ff", 0.9);
    rim.position.set(2.6, 1.2, -12);
    camera.add(key, rim);

    const block = buildLandBlock(assets, ring, renderer.capabilities.getMaxAnisotropy());
    scene.add(block.group, block.floor);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, VIEW.targetY, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.minPolarAngle = VIEW.minPolar;
    controls.maxPolarAngle = VIEW.maxPolar;
    controls.autoRotateSpeed = ROTATE_SPEED;
    // A sideways drag turns the block; an up-and-down swipe still scrolls the page.
    canvas.style.touchAction = "pan-y";

    let placed = false;
    const resize = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height);
      block.setResolution(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Refit the distance; keep wherever the viewer has turned the block.
      const distance = fitDistance(camera.aspect);
      const azimuth = placed ? controls.getAzimuthalAngle() : VIEW.azimuth;
      const polar = placed ? controls.getPolarAngle() : VIEW.polar;
      camera.position.set(...cameraPosition(azimuth, polar, distance));
      controls.minDistance = distance;
      controls.maxDistance = distance;
      controls.update();
      placed = true;
    };
    resize();
    const resizer = new ResizeObserver(resize);
    resizer.observe(node);

    // Only draw while the block is on screen.
    let visible = true;
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    watcher.observe(node);

    let id = 0;
    let introStart: number | null = null;
    let announced = false;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (!visible || !placed) return;
      if (live.current.revealed) {
        introStart ??= now;
        const progress = Math.min(1, (now - introStart) / INTRO_MS);
        block.setIntro(progress);
        controls.autoRotate = progress >= 1;
      } else {
        block.setIntro(0);
      }
      controls.update();
      renderer.render(scene, camera);
      if (!announced) {
        announced = true;
        live.current.onReady?.();
      }
    };
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      watcher.disconnect();
      resizer.disconnect();
      controls.dispose();
      block.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [assets, ring]);

  return <div ref={frame} className="land-scene" data-land="webgl" aria-hidden="true" />;
}
