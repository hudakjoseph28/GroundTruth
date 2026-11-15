import { useEffect, useRef, type RefObject } from "react";
import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AMBIENT_EVERY, BOUNDARY_LAP_MS, LEDGER_ENTRANCE_MAX, easeOut } from "../motion";
import { VIEW, blockCenter, blockDims, cameraPosition, fitDistance } from "./blockFrame";
import { buildLandBlock } from "./buildBlock";
import type { LandAssets } from "./landAssets";

/** How long the gold frame takes to give way to the land, in milliseconds. */
const INTRO_MS = 900;
/** OrbitControls turns 6° a second at speed 1; this is one turn in about 100 s. */
const ROTATE_SPEED = 0.6;
/** After a drag or a key press, the block rests this long before moving on its own again. */
const IDLE_MS = 3000;
/** The sun goes once round the block in this many milliseconds. */
const SUN_LAP_MS = 9000;
/** How high the sun sits. Low, so the relief throws light and shade. */
const SUN_ELEVATION = 0.42;
/** The float: how far, in block units, and how long one rise and fall takes. */
const BOB_HEIGHT = 0.022;
const BOB_MS = 5200;
/** The most the block leans toward the cursor, in radians. */
const TILT = 0.07;
/** A press that moves less than this many pixels is a click, not a drag. */
const CLICK_SLOP = 6;

/** Turns the block from outside the scene, for keyboard users. */
export type Turn = (around: number, over: number) => void;

/**
 * The land block in WebGL. Decorative: the page describes the parcel in text.
 * Loaded lazily, so three.js never holds up the first paint.
 */
export function LandBlockScene({
  assets,
  ring,
  revealed,
  turn,
  onReady,
  onActivate,
}: {
  assets: LandAssets;
  ring: number[][];
  /** False while the transition covers the page; the hand-off starts when it turns true. */
  revealed: boolean;
  /** Filled in with a function that turns the block. */
  turn: RefObject<Turn | null>;
  onReady?: () => void;
  /** A click on the block that was not a drag. */
  onActivate?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const live = useRef({ revealed, onReady, onActivate });
  useEffect(() => {
    live.current = { revealed, onReady, onActivate };
  }, [revealed, onReady, onActivate]);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.setAttribute("tabindex", "-1");
    node.appendChild(canvas);

    const dims = blockDims(assets.meta);
    const target = blockCenter(dims);

    const scene = new Scene();
    const camera = new PerspectiveCamera(VIEW.fov, 1, 0.1, 80);
    scene.add(camera);

    // Three lights. A soft key and a cool rim ride with the camera, so every
    // angle reads. The sun stays in the world and circles low over the block,
    // so the relief catches light as it passes.
    scene.add(new HemisphereLight("#ffffff", "#1c1712", 0.6));
    const key = new DirectionalLight("#fff4e2", 1.05);
    key.position.set(-2.2, 3.4, 1.6);
    const rim = new DirectionalLight("#cfd8ff", 0.8);
    rim.position.set(2.6, 1.2, -12);
    camera.add(key, rim);
    const sun = new DirectionalLight("#ffe9c4", 1.7);
    scene.add(sun);

    const block = buildLandBlock(assets, ring, renderer.capabilities.getMaxAnisotropy());
    // The rig floats and leans; the block inside it handles the hand-off.
    const rig = new Group();
    rig.add(block.group);
    scene.add(rig, block.floor);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...target);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.minPolarAngle = VIEW.minPolar;
    controls.maxPolarAngle = VIEW.maxPolar;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0;
    // A sideways drag turns the block; an up-and-down swipe still scrolls the page.
    canvas.style.touchAction = "pan-y";

    let aspect = 1;
    let placed = false;
    /** Keep the block filling the container, whatever angle it is seen from. */
    const refit = () => {
      const distance = fitDistance(aspect, dims, placed ? controls.getPolarAngle() : VIEW.polar);
      controls.minDistance = distance;
      controls.maxDistance = distance;
      return distance;
    };
    const resize = () => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height);
      block.setResolution(width, height);
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const distance = refit();
      if (!placed) {
        camera.position.set(...cameraPosition(VIEW.azimuth, VIEW.polar, distance, target));
        placed = true;
      }
      controls.update();
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

    // Its own motion stops while someone is turning it, and for a while after.
    let dragging = false;
    let restUntil = 0;
    const rest = () => {
      restUntil = performance.now() + IDLE_MS;
    };
    const onStart = () => {
      dragging = true;
    };
    const onEnd = () => {
      dragging = false;
      rest();
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);

    turn.current = (around, over) => {
      const polar = Math.min(VIEW.maxPolar, Math.max(VIEW.minPolar, controls.getPolarAngle() + over));
      const azimuth = controls.getAzimuthalAngle() + around;
      camera.position.set(...cameraPosition(azimuth, polar, fitDistance(aspect, dims, polar), target));
      rest();
    };

    // The cursor, from -1 to 1 across the canvas, for the lean. Mouse only.
    const cursor = { x: 0, y: 0, over: false };
    const press = { x: 0, y: 0, at: 0 };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = canvas.getBoundingClientRect();
      cursor.x = ((event.clientX - box.left) / box.width) * 2 - 1;
      cursor.y = 1 - ((event.clientY - box.top) / box.height) * 2;
      cursor.over = true;
    };
    const onLeave = () => {
      cursor.over = false;
    };
    const onDown = (event: PointerEvent) => {
      press.x = event.clientX;
      press.y = event.clientY;
      press.at = performance.now();
    };
    const onUp = (event: PointerEvent) => {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (event.button === 0 && moved < CLICK_SLOP && performance.now() - press.at < 600) {
        live.current.onActivate?.();
      }
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);

    const lean = { x: 0, y: 0 };
    const towardCamera = new Vector3();
    const acrossCamera = new Vector3();
    const leanAcross = new Quaternion();
    const leanToward = new Quaternion();

    let id = 0;
    let last: number | null = null;
    let introStart: number | null = null;
    let announced = false;
    /** 0 while resting, 1 when free to move; eased between the two. */
    let free = 0;
    /** Clocks that only run while the block is free, so nothing jumps on resume. */
    let bobClock = 0;
    let sunClock = 0;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (!visible || !placed) {
        last = null;
        return;
      }
      const delta = Math.min(64, last === null ? 16 : now - last);
      last = now;

      let intro = 0;
      if (live.current.revealed) {
        introStart ??= now;
        intro = Math.min(1, (now - introStart) / INTRO_MS);
      }
      block.setIntro(intro);

      // Nothing moves on its own until the hand-off is done, or while it is being turned.
      const wanted = intro >= 1 && !dragging && now >= restUntil ? 1 : 0;
      free += (wanted - free) * Math.min(1, delta / 420);
      const eased = easeOut(free);
      bobClock += delta * free;
      sunClock += delta * free;

      controls.autoRotateSpeed = ROTATE_SPEED * eased;
      refit();
      controls.update();

      // Float.
      rig.position.y = Math.sin((bobClock / BOB_MS) * Math.PI * 2) * BOB_HEIGHT * eased;

      // Lean toward the cursor, in the camera's terms.
      const azimuth = controls.getAzimuthalAngle();
      const pull = cursor.over && !dragging ? eased : 0;
      lean.x += (cursor.x * pull - lean.x) * Math.min(1, delta / 180);
      lean.y += (cursor.y * pull - lean.y) * Math.min(1, delta / 180);
      towardCamera.set(Math.sin(azimuth), 0, Math.cos(azimuth));
      acrossCamera.set(Math.cos(azimuth), 0, -Math.sin(azimuth));
      leanAcross.setFromAxisAngle(towardCamera, -lean.x * TILT);
      leanToward.setFromAxisAngle(acrossCamera, lean.y * TILT);
      rig.quaternion.copy(leanAcross).multiply(leanToward);

      // Sun sweep.
      const sunAngle = (sunClock / SUN_LAP_MS) * Math.PI * 2;
      sun.position.set(
        Math.cos(sunAngle) * Math.cos(SUN_ELEVATION),
        Math.sin(SUN_ELEVATION),
        Math.sin(sunAngle) * Math.cos(SUN_ELEVATION),
      );

      // Boundary pulse, on the same beat as the ledger's.
      if (introStart !== null) {
        const since = now - introStart - LEDGER_ENTRANCE_MAX - AMBIENT_EVERY / 2;
        const phase = since < 0 ? -1 : since % AMBIENT_EVERY;
        const running = free > 0.5 && phase >= 0 && phase < BOUNDARY_LAP_MS;
        block.setBoundaryPulse(running ? phase / BOUNDARY_LAP_MS : null);
      }

      renderer.render(scene, camera);
      if (!announced) {
        announced = true;
        live.current.onReady?.();
      }
    };
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      turn.current = null;
      watcher.disconnect();
      resizer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.dispose();
      block.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [assets, ring, turn]);

  return <div ref={frame} className="land-scene" data-land="webgl" aria-hidden="true" />;
}
