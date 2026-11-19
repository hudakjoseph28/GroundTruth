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
import {
  SOIL_DEPTH,
  TABLE_SOIL_DEPTH,
  VIEW,
  blockCenter,
  blockDims,
  boxCorners,
  cameraPosition,
  fitDistance,
} from "./blockFrame";
import { buildLandBlock } from "./buildBlock";
import { heightAt, type LandAssets } from "./landAssets";

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
/** How long the boundary takes to go green and back when a release ripples through it. */
const RIPPLE_MS = 1300;
/**
 * On a table the block does not spin or float. It takes this share of the
 * picture's width and height, sits this many pixels below the middle to leave
 * room above it, and sways this many radians either way.
 */
const TABLE = { fillX: 0.72, fillY: 0.52, drop: 66, sway: 0.1, swayMs: 28000 } as const;
/** Where the table's light comes from: over the viewer's left shoulder. */
const TABLE_SUN: [number, number, number] = [-0.72, 0.62, 0.3];

/** "float": free in space, slowly turning. "table": resting on a ground sheet, almost still. */
export type Staging = "float" | "table";

/** Turns the block from outside the scene, for keyboard users. */
export type Turn = (around: number, over: number) => void;

/**
 * Where the eight corners of the block's bounding box are on screen right now,
 * in viewport pixels and in boxCorners order. Null before the first frame.
 */
export type Probe = () => { x: number; y: number }[] | null;

/** What a page can ask of a running scene. */
export interface LandHandle {
  /** Where a point on the terrain is on screen, in viewport pixels; u runs east and v south, 0 to 1. */
  surface(u: number, v: number): { x: number; y: number } | null;
  /** A brief green ripple through the parcel boundary. */
  ripple(): void;
  /** Scales the block's own turning: 1 is its usual pace. */
  setPace(pace: number): void;
}

/**
 * The land block in WebGL. Decorative: the page describes the parcel in text.
 * Loaded lazily, so three.js never holds up the first paint.
 */
export function LandBlockScene({
  assets,
  ring,
  revealed,
  turn,
  probe,
  handle,
  paused = false,
  interactive = true,
  cornerDots = true,
  staging = "float",
  overlay = null,
  boundary = true,
  onReady,
  onActivate,
}: {
  assets: LandAssets;
  ring: number[][];
  /** False while the transition covers the page; the hand-off starts when it turns true. */
  revealed: boolean;
  /** Filled in with a function that turns the block. */
  turn?: RefObject<Turn | null>;
  /** Filled in with a function that reports where the block is on screen. */
  probe?: RefObject<Probe | null>;
  /** Filled in with the scene's handle. */
  handle?: RefObject<LandHandle | null>;
  /** True while something else is showing in its place: nothing is drawn. */
  paused?: boolean;
  /** False where the block is only a picture: no dragging, no lean, no click. */
  interactive?: boolean;
  /** False leaves out the glowing points on the block's corners. */
  cornerDots?: boolean;
  staging?: Staging;
  /** Map layers painted over the imagery (see Layers/paintLayers.ts). */
  overlay?: HTMLCanvasElement | null;
  /** False hides the gold boundary line. */
  boundary?: boolean;
  onReady?: () => void;
  /** A click on the block that was not a drag. */
  onActivate?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const live = useRef({ revealed, paused, onReady, onActivate, overlay, boundary });
  useEffect(() => {
    live.current = { revealed, paused, onReady, onActivate, overlay, boundary };
  }, [revealed, paused, onReady, onActivate, overlay, boundary]);
  /** The running block, so layers can change without rebuilding the scene. */
  const built = useRef<ReturnType<typeof buildLandBlock> | null>(null);
  useEffect(() => {
    built.current?.setOverlay(overlay);
  }, [overlay]);
  useEffect(() => {
    built.current?.setBoundaryVisible(boundary);
  }, [boundary]);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.setAttribute("tabindex", "-1");
    node.appendChild(canvas);

    const table = staging === "table";
    const dims = blockDims(assets.meta, table ? TABLE_SOIL_DEPTH : SOIL_DEPTH);
    const target = blockCenter(dims);
    const fillX = table ? TABLE.fillX : undefined;
    const fillY = table ? TABLE.fillY : undefined;

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

    const block = buildLandBlock(assets, ring, renderer.capabilities.getMaxAnisotropy(), {
      cornerDots,
      table,
    });
    if (table) sun.position.set(...TABLE_SUN);
    built.current = block;
    if (live.current.overlay) block.setOverlay(live.current.overlay);
    block.setBoundaryVisible(live.current.boundary);
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
    controls.enableRotate = interactive;
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
      const polar = placed ? controls.getPolarAngle() : VIEW.polar;
      const distance = fitDistance(aspect, dims, polar, fillX, fillY);
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
      // Lower in the picture, leaving the room above it clear.
      if (table) camera.setViewOffset(width, height, 0, -TABLE.drop, width, height);
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

    if (turn) {
      turn.current = (around, over) => {
        const polar = Math.min(VIEW.maxPolar, Math.max(VIEW.minPolar, controls.getPolarAngle() + over));
        const azimuth = controls.getAzimuthalAngle() + around;
        camera.position.set(
          ...cameraPosition(azimuth, polar, fitDistance(aspect, dims, polar, fillX, fillY), target),
        );
        rest();
      };
    }

    const corner = new Vector3();
    if (probe) {
      probe.current = () => {
        const box = canvas.getBoundingClientRect();
        if (!placed || box.width < 1 || box.height < 1) return null;
        return boxCorners(dims).map((point) => {
          corner.set(...point).applyMatrix4(rig.matrixWorld).project(camera);
          return {
            x: box.left + (corner.x * 0.5 + 0.5) * box.width,
            y: box.top + (0.5 - corner.y * 0.5) * box.height,
          };
        });
      };
    }

    let drawn = false;
    let paceTarget = 1;
    let rippleAt: number | null = null;
    if (handle) {
      handle.current = {
        surface(u, v) {
          const box = canvas.getBoundingClientRect();
          if (!drawn || box.width < 1 || box.height < 1) return null;
          corner
            .set((u - 0.5) * dims.width, heightAt(assets, u, v) * dims.top, (v - 0.5) * dims.depth)
            .applyMatrix4(block.group.matrixWorld)
            .project(camera);
          return {
            x: box.left + (corner.x * 0.5 + 0.5) * box.width,
            y: box.top + (0.5 - corner.y * 0.5) * box.height,
          };
        },
        ripple() {
          rippleAt = performance.now();
        },
        setPace(pace) {
          paceTarget = pace;
        },
      };
    }

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
    if (interactive) {
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointerup", onUp);
    }

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
    let swayClock = 0;
    let pace = 1;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (!visible || !placed || live.current.paused) {
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

      pace += (paceTarget - pace) * Math.min(1, delta / 320);
      if (table) {
        // A slow sway about the opening angle, in place of the turn.
        swayClock += delta * free * pace;
        const azimuth = VIEW.azimuth + Math.sin((swayClock / TABLE.swayMs) * Math.PI * 2) * TABLE.sway;
        camera.position.set(...cameraPosition(azimuth, VIEW.polar, refit(), target));
      } else {
        controls.autoRotateSpeed = ROTATE_SPEED * eased * pace;
        refit();
      }
      controls.update();

      // Float.
      if (!table) rig.position.y = Math.sin((bobClock / BOB_MS) * Math.PI * 2) * BOB_HEIGHT * eased;

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

      // Sun sweep. On a table the light stays put.
      if (!table) {
        const sunAngle = (sunClock / SUN_LAP_MS) * Math.PI * 2;
        sun.position.set(
          Math.cos(sunAngle) * Math.cos(SUN_ELEVATION),
          Math.sin(SUN_ELEVATION),
          Math.sin(sunAngle) * Math.cos(SUN_ELEVATION),
        );
      }

      // Boundary pulse, on the same beat as the ledger's.
      if (introStart !== null) {
        const since = now - introStart - LEDGER_ENTRANCE_MAX - AMBIENT_EVERY / 2;
        const phase = since < 0 ? -1 : since % AMBIENT_EVERY;
        const running = free > 0.5 && phase >= 0 && phase < BOUNDARY_LAP_MS;
        block.setBoundaryPulse(running ? phase / BOUNDARY_LAP_MS : null);
      }
      // A release: the boundary goes green and a pulse laps it, once.
      if (rippleAt !== null) {
        const lap = (now - rippleAt) / RIPPLE_MS;
        if (lap >= 1) {
          rippleAt = null;
          block.setBoundaryTone(0);
          block.setBoundaryPulse(null);
        } else {
          block.setBoundaryTone(Math.sin(Math.PI * lap));
          block.setBoundaryPulse(lap);
        }
      }

      renderer.render(scene, camera);
      drawn = true;
      if (!announced) {
        announced = true;
        live.current.onReady?.();
      }
    };
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      if (turn) turn.current = null;
      if (probe) probe.current = null;
      if (handle) handle.current = null;
      watcher.disconnect();
      resizer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.dispose();
      if (built.current === block) built.current = null;
      block.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [assets, ring, turn, probe, handle, interactive, cornerDots, staging]);

  return <div ref={frame} className="land-scene" data-land="webgl" aria-hidden="true" />;
}
