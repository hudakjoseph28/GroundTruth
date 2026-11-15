// three.js objects for the land block: a terrain top textured with the baked
// aerial imagery, soil-strata walls down to a flat base, the parcel boundary in
// gold, and a frame drawn in the globe's point-and-line style.
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { seeded } from "../../globe/geo";
import { PALETTE } from "../../globe/palette";
import { BOX_EDGES, blockDims, boxCorners, type BlockDims, type Vec3 } from "./blockFrame";
import { heightAt, type LandAssets } from "./landAssets";
import { regionUV } from "./landMeta";

/** Cells along each side of the terrain grid. */
const GRID = 128;

export interface LandBlockObject {
  group: Group;
  /** Soft floor under the block, so it reads as floating. */
  floor: Mesh;
  setResolution(width: number, height: number): void;
  /** 0 shows the gold hand-off frame around a slightly small block; 1 is the settled block. */
  setIntro(progress: number): void;
  /** Puts the travelling pulse this far round the parcel boundary (0..1), or hides it with null. */
  setBoundaryPulse(progress: number | null): void;
  dispose(): void;
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  return [canvas, context];
}

/** The aerial imagery, a little dimmer outside the parcel so the lot reads first. */
function imageryTexture(assets: LandAssets, ring: number[][]): CanvasTexture {
  const width = assets.imagery.naturalWidth;
  const height = assets.imagery.naturalHeight;
  const [canvas, context] = canvas2d(width, height);
  // Aerial photos are hazy; a little contrast keeps the ground from washing out under the lights.
  context.filter = "contrast(1.14) saturate(1.18)";
  context.drawImage(assets.imagery, 0, 0, width, height);
  context.filter = "none";
  if (ring.length) {
    context.beginPath();
    context.rect(0, 0, width, height);
    ring.forEach((pair, index) => {
      const { u, v } = regionUV(assets.meta.bbox, pair[0] ?? 0, pair[1] ?? 0);
      if (index === 0) context.moveTo(u * width, v * height);
      else context.lineTo(u * width, v * height);
    });
    context.closePath();
    context.fillStyle = "rgba(4, 4, 4, 0.36)";
    context.fill("evenodd");
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// Depth below the surface (0..1) where each soil band ends, and its color.
const STRATA: readonly { to: number; color: string }[] = [
  { to: 0.04, color: "#1d1812" }, // humus
  { to: 0.19, color: "#4b3929" }, // topsoil
  { to: 0.44, color: "#6b523b" }, // subsoil
  { to: 0.68, color: "#7b654e" }, // clay
  { to: 0.87, color: "#57514b" }, // weathered rock
  { to: 1, color: "#3a3937" }, // bedrock
];

/**
 * A stylized soil cross-section. It tiles left to right, so the bands meet at
 * the block's corners.
 */
function strataTexture(): CanvasTexture {
  const width = 1024;
  const height = 512;
  const [canvas, context] = canvas2d(width, height);
  const random = seeded(39049);
  const waves = STRATA.map((_, band) => ({
    cycles: [1 + (band % 2), 3 + band, 7 + 2 * band],
    phase: [random() * 6.28, random() * 6.28, random() * 6.28],
    size: 2 + band * 2.4,
  }));
  const edge = (band: number, x: number): number => {
    const wave = waves[band]!;
    const t = (x / width) * Math.PI * 2;
    const wobble =
      Math.sin(t * wave.cycles[0]! + wave.phase[0]!) +
      0.5 * Math.sin(t * wave.cycles[1]! + wave.phase[1]!) +
      0.25 * Math.sin(t * wave.cycles[2]! + wave.phase[2]!);
    return STRATA[band]!.to * height + wobble * wave.size;
  };

  for (let x = 0; x < width; x += 2) {
    let top = 0;
    STRATA.forEach((band, index) => {
      const bottom = index === STRATA.length - 1 ? height : edge(index, x);
      context.fillStyle = band.color;
      context.fillRect(x, top, 2, Math.ceil(bottom - top) + 1);
      top = bottom;
    });
  }
  // Hairline seams where one band meets the next.
  context.lineWidth = 1;
  for (let band = 0; band < STRATA.length - 1; band++) {
    context.strokeStyle = "rgba(0, 0, 0, 0.28)";
    context.beginPath();
    for (let x = 0; x <= width; x += 4) context.lineTo(x, edge(band, x));
    context.stroke();
  }
  // Grain, then stones in the lower bands.
  for (let i = 0; i < 26000; i++) {
    const light = random() < 0.5;
    context.fillStyle = light
      ? `rgba(255, 240, 220, ${0.03 + random() * 0.05})`
      : `rgba(0, 0, 0, ${0.05 + random() * 0.1})`;
    context.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random());
  }
  for (let i = 0; i < 150; i++) {
    const y = height * (0.3 + random() * 0.68);
    context.fillStyle = `rgba(190, 180, 168, ${0.08 + random() * 0.12})`;
    context.beginPath();
    context.ellipse(random() * width, y, 2 + random() * 6, 1.5 + random() * 3, random() * 3, 0, 6.3);
    context.fill();
  }
  // Soil darkens with depth, which also settles the base into the page.
  const shade = context.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
}

function glowTexture(stops: [number, string][]): CanvasTexture {
  const [canvas, context] = canvas2d(128, 128);
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

function surfaceGeometry(assets: LandAssets, dims: BlockDims): BufferGeometry {
  const n = GRID + 1;
  const position = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / GRID;
      const v = j / GRID;
      const at = j * n + i;
      position[at * 3] = (u - 0.5) * dims.width;
      position[at * 3 + 1] = heightAt(assets, u, v) * dims.top;
      position[at * 3 + 2] = (v - 0.5) * dims.depth;
      uv[at * 2] = u;
      uv[at * 2 + 1] = 1 - v;
    }
  }
  const index = new Uint16Array(GRID * GRID * 6);
  let cursor = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(Array.from(index));
  geometry.computeVertexNormals();
  return geometry;
}

// The four walls, walked counterclockwise seen from above, so each one runs
// left to right when you face it. u and v pick the surface edge it hangs from.
const WALLS: readonly { normal: Vec3; at: (t: number) => [number, number] }[] = [
  { normal: [0, 0, 1], at: (t) => [t, 1] }, // south
  { normal: [1, 0, 0], at: (t) => [1, 1 - t] }, // east
  { normal: [0, 0, -1], at: (t) => [1 - t, 0] }, // north
  { normal: [-1, 0, 0], at: (t) => [0, t] }, // west
];

/** Walls from the surface edge down to the flat base, plus that edge as a polyline. */
function wallGeometry(
  assets: LandAssets,
  dims: BlockDims,
): { geometry: BufferGeometry; rim: Vec3[][] } {
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const rim: Vec3[][] = [];
  const thickness = dims.top - dims.base;
  for (const wall of WALLS) {
    const start = position.length / 3;
    const edge: Vec3[] = [];
    for (let k = 0; k <= GRID; k++) {
      const t = k / GRID;
      const [u, v] = wall.at(t);
      const x = (u - 0.5) * dims.width;
      const z = (v - 0.5) * dims.depth;
      const y = heightAt(assets, u, v) * dims.top;
      edge.push([x, y, z]);
      position.push(x, y, z, x, dims.base, z);
      normal.push(...wall.normal, ...wall.normal);
      // The strata hang from the surface, so the bands follow the terrain.
      uv.push(t, 1, t, 1 - (y - dims.base) / thickness);
      if (k < GRID) {
        const top = start + k * 2;
        index.push(top, top + 1, top + 3, top, top + 3, top + 2);
      }
    }
    rim.push(edge);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return { geometry, rim };
}

/** The parcel boundary, draped over the terrain. */
function boundaryPositions(assets: LandAssets, dims: BlockDims, ring: number[][]): number[] {
  const positions: number[] = [];
  const lift = 0.006;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = regionUV(assets.meta.bbox, ring[i]![0] ?? 0, ring[i]![1] ?? 0);
    const b = regionUV(assets.meta.bbox, ring[i + 1]![0] ?? 0, ring[i + 1]![1] ?? 0);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) * GRID * 2));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const u = a.u + ((b.u - a.u) * s) / steps;
      const v = a.v + ((b.v - a.v) * s) / steps;
      positions.push(
        (u - 0.5) * dims.width,
        heightAt(assets, u, v) * dims.top + lift,
        (v - 0.5) * dims.depth,
      );
    }
  }
  return positions;
}

function segments(points: Vec3[][]): BufferGeometry {
  const position: number[] = [];
  for (const line of points) {
    for (let i = 0; i < line.length - 1; i++) position.push(...line[i]!, ...line[i + 1]!);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  return geometry;
}

export function buildLandBlock(
  assets: LandAssets,
  ring: number[][],
  anisotropy: number,
): LandBlockObject {
  const dims = blockDims(assets.meta);
  const group = new Group();
  const textures: Texture[] = [];
  const materials: Material[] = [];
  const geometries: BufferGeometry[] = [];
  const keep = <T extends Texture | Material | BufferGeometry>(item: T): T => {
    if (item instanceof BufferGeometry) geometries.push(item);
    else if ("isTexture" in item) textures.push(item);
    else materials.push(item);
    return item;
  };

  const imagery = keep(imageryTexture(assets, ring));
  imagery.anisotropy = anisotropy;
  const top = new Mesh(
    keep(surfaceGeometry(assets, dims)),
    keep(
      new MeshStandardMaterial({
        map: imagery,
        roughness: 0.94,
        metalness: 0,
        // Sit a hair behind the boundary line drawn on top.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    ),
  );

  const strata = keep(strataTexture());
  strata.anisotropy = anisotropy;
  const walls = wallGeometry(assets, dims);
  const sides = new Mesh(
    keep(walls.geometry),
    keep(new MeshStandardMaterial({ map: strata, roughness: 1, metalness: 0 })),
  );

  const underside = new Mesh(
    keep(new PlaneGeometry(dims.width, dims.depth)),
    keep(new MeshBasicMaterial({ color: "#0b0a09" })),
  );
  underside.rotation.x = Math.PI / 2;
  underside.position.y = dims.base;

  group.add(top, sides, underside);

  // Thin gold line on the legal boundary.
  const boundaryMaterial = keep(
    new LineMaterial({ color: PALETTE.gold, linewidth: 2.2, transparent: true, opacity: 0.95 }),
  );
  // A soft point of light that runs round the boundary, like the ledger's pulse.
  const pulseMaterial = keep(
    new PointsMaterial({
      map: keep(
        glowTexture([
          [0, "rgba(255,255,255,1)"],
          [0.25, "rgba(255,236,196,0.75)"],
          [1, "rgba(217,174,95,0)"],
        ]),
      ),
      size: 18,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  const pulseGeometry = keep(new BufferGeometry());
  pulseGeometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  const pulse = new Points(pulseGeometry, pulseMaterial);
  pulse.visible = false;
  pulse.frustumCulled = false;
  pulse.renderOrder = 3;

  // The boundary as a path: points, and how far along the line each one is.
  let path: { points: number[]; along: number[]; length: number } | null = null;
  if (ring.length >= 4) {
    const points = boundaryPositions(assets, dims, ring);
    const boundaryGeometry = keep(new LineGeometry());
    boundaryGeometry.setPositions(points);
    group.add(new Line2(boundaryGeometry, boundaryMaterial), pulse);
    const along = [0];
    for (let i = 3; i < points.length; i += 3) {
      along.push(
        along[along.length - 1]! +
          Math.hypot(points[i]! - points[i - 3]!, points[i + 1]! - points[i - 2]!, points[i + 2]! - points[i - 1]!),
      );
    }
    path = { points, along, length: along[along.length - 1]! };
  }

  // Frame in the globe's language: hairlines along the block's edges, with a
  // small glowing point on every corner.
  const corners = boxCorners(dims);
  const cornerTops: Vec3[] = walls.rim.map((edge) => edge[0]!);
  const frameLines: Vec3[][] = [
    ...walls.rim,
    [corners[0]!, corners[1]!, corners[2]!, corners[3]!, corners[0]!],
    ...cornerTops.map((point): Vec3[] => [point, [point[0], dims.base, point[2]]]),
  ];
  const frame = new LineSegments(
    keep(segments(frameLines)),
    keep(
      new LineBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.26,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  frame.scale.setScalar(1.002);

  const nodeGeometry = keep(new BufferGeometry());
  nodeGeometry.setAttribute(
    "position",
    new Float32BufferAttribute([...corners.slice(0, 4), ...cornerTops].flat(), 3),
  );
  const nodes = new Points(
    nodeGeometry,
    keep(
      new PointsMaterial({
        map: keep(
          glowTexture([
            [0, "rgba(255,255,255,1)"],
            [0.25, "rgba(255,255,255,0.7)"],
            [0.5, "rgba(255,255,255,0.12)"],
            [1, "rgba(255,255,255,0)"],
          ]),
        ),
        size: 11,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    ),
  );
  group.add(frame, nodes);

  // The gold wireframe the transition hands over; it fades as the land appears.
  const handoffMaterial = keep(
    new LineBasicMaterial({
      color: PALETTE.gold,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  const handoff = new LineSegments(
    keep(segments(BOX_EDGES.map(([a, b]): Vec3[] => [corners[a]!, corners[b]!]))),
    handoffMaterial,
  );
  handoff.renderOrder = 2;
  group.add(handoff);

  // A faint pool of light with a dark core: a contact shadow that still reads
  // on a near-black page.
  const floor = new Mesh(
    keep(new PlaneGeometry(dims.width * 1.95, dims.depth * 1.95)),
    keep(
      new MeshBasicMaterial({
        map: keep(
          glowTexture([
            [0, "rgba(255,255,255,0)"],
            [0.34, "rgba(255,255,255,0)"],
            [0.58, "rgba(255,255,255,0.06)"],
            [0.8, "rgba(255,255,255,0.014)"],
            [0.92, "rgba(255,255,255,0)"],
            [1, "rgba(255,255,255,0)"],
          ]),
        ),
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = dims.base - 0.26;

  return {
    group,
    floor,
    setResolution(width, height) {
      boundaryMaterial.resolution.set(width, height);
    },
    setIntro(progress) {
      const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 3);
      group.scale.setScalar(0.94 + 0.06 * eased);
      handoffMaterial.opacity = 1 - eased;
      handoff.visible = eased < 1;
    },
    setBoundaryPulse(progress) {
      if (!path || progress === null || path.length <= 0) {
        pulse.visible = false;
        return;
      }
      const at = (((progress % 1) + 1) % 1) * path.length;
      // Find the segment this distance falls on.
      let low = 0;
      let high = path.along.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (path.along[middle]! <= at) low = middle;
        else high = middle;
      }
      const span = path.along[high]! - path.along[low]! || 1;
      const t = (at - path.along[low]!) / span;
      const a = low * 3;
      const b = high * 3;
      const position = pulseGeometry.getAttribute("position");
      position.setXYZ(
        0,
        path.points[a]! + (path.points[b]! - path.points[a]!) * t,
        path.points[a + 1]! + (path.points[b + 1]! - path.points[a + 1]!) * t + 0.004,
        path.points[a + 2]! + (path.points[b + 2]! - path.points[a + 2]!) * t,
      );
      position.needsUpdate = true;
      // Fade in and out at the ends of the lap.
      pulseMaterial.opacity = Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * 3) * 0.9;
      pulse.visible = true;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
