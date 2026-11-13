// three.js objects for the network globe, handed to react-globe.gl's custom layer.
// Everything is one draw call per layer: points, web, rays, pulses, hub.
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  type Object3D,
} from "three";
import { arcDegrees, slerp } from "./geo";
import type { GlobePoint, Network, NetworkEdge, Pulse } from "./network";
import { PALETTE } from "./palette";

/** Same convention as three-globe's polar2Cartesian, so layers line up with the globe. */
export function toXYZ(lat: number, lng: number, alt: number, radius: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = radius * (1 + alt);
  return [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

// Points fade out near the limb so the silhouette stays crisp instead of piling up.
const FACING = /* glsl */ `
  float facing(vec3 world) {
    return dot(normalize(world), normalize(cameraPosition - world));
  }
`;

const pointsVertex = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uLimb;
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  ${FACING}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float fade = mix(1.0, smoothstep(-0.02, 0.22, facing(world.xyz)), uLimb);
    vColor = aColor * fade;
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Tight glow: a hard core with a short falloff, so the network stays crisp.
const pointsFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = 1.0 - smoothstep(0.3, 0.55, d);
    float halo = pow(1.0 - d, 3.0) * 0.3;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`;

const linesVertex = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  ${FACING}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vColor = aColor * smoothstep(-0.05, 0.25, facing(world.xyz));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const linesFragment = /* glsl */ `
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

// Each pulse is a short comet: a head and a few trailing dots, moved on the GPU.
const pulseVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uRadius;
  attribute vec3 aEnd;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aTrail;
  attribute float aLift;
  varying float vAlpha;
  ${FACING}
  void main() {
    float cycle = fract(uTime * aSpeed + aPhase);
    float p = cycle / 0.32 - aTrail * 0.035;
    float visible = step(0.0, p) * step(p, 1.0);
    p = clamp(p, 0.0, 1.0);
    vec3 dir = normalize(mix(normalize(position), normalize(aEnd), p));
    float h = uRadius * (1.006 + aLift * 4.0 * p * (1.0 - p));
    vec4 world = modelMatrix * vec4(dir * h, 1.0);
    float edgeFade = smoothstep(0.0, 0.12, p) * smoothstep(1.0, 0.82, p);
    vAlpha = visible * edgeFade * (1.0 - aTrail * 0.24) * smoothstep(-0.02, 0.2, facing(world.xyz));
    gl_PointSize = (6.5 - aTrail * 1.1) * uPixelRatio;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const pulseFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = 1.0 - smoothstep(0.2, 0.5, d);
    float halo = pow(1.0 - d, 3.0) * 0.4;
    gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * vAlpha * (core + halo), 1.0);
  }
`;

function material(vertexShader: string, fragmentShader: string, uniforms: ShaderMaterial["uniforms"]) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function pointsLayer(points: GlobePoint[], radius: number, limb: boolean, pixelRatio: number): Points {
  const position: number[] = [];
  const color: number[] = [];
  const size: number[] = [];
  for (const p of points) {
    position.push(...toXYZ(p.lat, p.lng, p.alt, radius));
    color.push(p.color[0] * p.alpha, p.color[1] * p.alpha, p.color[2] * p.alpha);
    size.push(p.size);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute(color, 3));
  geometry.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  return new Points(
    geometry,
    material(pointsVertex, pointsFragment, {
      uPixelRatio: { value: pixelRatio },
      uLimb: { value: limb ? 1 : 0 },
    }),
  );
}

/** Lines follow the great circle; lifted ones (rays) bow gently off the surface. */
function linesLayer(edges: NetworkEdge[], radius: number): LineSegments {
  const position: number[] = [];
  const color: number[] = [];
  for (const e of edges) {
    const length = arcDegrees(e.aLat, e.aLng, e.bLat, e.bLng);
    const steps = Math.max(1, Math.ceil(length / 2.5));
    let prev: [number, number, number] | null = null;
    let prevAlpha = e.aAlpha;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const [lat, lng] = slerp(e.aLat, e.aLng, e.bLat, e.bLng, t);
      const xyz = toXYZ(lat, lng, 0.004 + e.lift * 4 * t * (1 - t), radius);
      const alpha = e.aAlpha + (e.bAlpha - e.aAlpha) * t;
      if (prev) {
        position.push(...prev, ...xyz);
        color.push(...e.color.map((c) => c * prevAlpha), ...e.color.map((c) => c * alpha));
      }
      prev = xyz;
      prevAlpha = alpha;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute(color, 3));
  return new LineSegments(geometry, material(linesVertex, linesFragment, {}));
}

const TRAIL = 5;

function pulsesLayer(pulses: Pulse[], radius: number, pixelRatio: number): Points {
  const start: number[] = [];
  const end: number[] = [];
  const phase: number[] = [];
  const speed: number[] = [];
  const trail: number[] = [];
  const lift: number[] = [];
  for (const { edge, phase: ph, speed: sp } of pulses) {
    const a = toXYZ(edge.aLat, edge.aLng, 0, radius);
    const b = toXYZ(edge.bLat, edge.bLng, 0, radius);
    for (let k = 0; k < TRAIL; k++) {
      start.push(...a);
      end.push(...b);
      phase.push(ph);
      speed.push(sp);
      trail.push(k);
      lift.push(edge.lift);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(start, 3));
  geometry.setAttribute("aEnd", new Float32BufferAttribute(end, 3));
  geometry.setAttribute("aPhase", new Float32BufferAttribute(phase, 1));
  geometry.setAttribute("aSpeed", new Float32BufferAttribute(speed, 1));
  geometry.setAttribute("aTrail", new Float32BufferAttribute(trail, 1));
  geometry.setAttribute("aLift", new Float32BufferAttribute(lift, 1));
  const points = new Points(
    geometry,
    material(pulseVertex, pulseFragment, {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uRadius: { value: radius },
    }),
  );
  points.frustumCulled = false; // positions move in the shader
  return points;
}

function glowTexture(stops: [number, string][]): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

/** Warm gold hub over Ohio: a white-hot core in a short gold bloom. */
function hubLayer(lat: number, lng: number, radius: number): { group: Group; core: Sprite } {
  const group = new Group();
  const bloom = new Sprite(
    new SpriteMaterial({
      map: glowTexture([
        [0, "rgba(217,174,95,0.55)"],
        [0.35, "rgba(217,174,95,0.18)"],
        [1, "rgba(217,174,95,0)"],
      ]),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  bloom.scale.setScalar(radius * 0.32);
  const core = new Sprite(
    new SpriteMaterial({
      map: glowTexture([
        [0, "rgba(255,255,250,1)"],
        [0.14, "rgba(255,244,214,0.95)"],
        [0.32, "rgba(232,196,120,0.5)"],
        [0.6, "rgba(217,174,95,0.12)"],
        [1, "rgba(217,174,95,0)"],
      ]),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  core.scale.setScalar(radius * 0.12);
  group.add(bloom, core);
  group.position.set(...toXYZ(lat, lng, 0.012, radius));
  return { group, core };
}

export interface GlobeLayers {
  objects: { object: Object3D }[];
  /** Advance the animation; seconds since start. */
  tick(seconds: number): void;
  /** Match point sizes to the renderer's pixel ratio. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

export function buildLayers(network: Network, radius = 100, pixelRatio = 1): GlobeLayers {
  const web = linesLayer(network.edges, radius);
  const rays = linesLayer(network.rays, radius);
  const points = pointsLayer(network.points, radius, true, pixelRatio);
  const halo = pointsLayer(network.halo, radius, false, pixelRatio);
  const pulses = pulsesLayer(network.pulses, radius, pixelRatio);
  const hub = hubLayer(network.hub.lat, network.hub.lng, radius);
  const all: Object3D[] = [web, rays, points, halo, pulses, hub.group];
  const time = (pulses.material as ShaderMaterial).uniforms.uTime!;
  const baseScale = radius * 0.12;

  return {
    objects: all.map((object) => ({ object })),
    setPixelRatio(ratio) {
      for (const layer of [points, halo, pulses]) {
        const uniform = (layer.material as ShaderMaterial).uniforms.uPixelRatio;
        if (uniform) uniform.value = ratio;
      }
    },
    tick(seconds) {
      time.value = seconds;
      hub.core.scale.setScalar(baseScale * (1 + 0.07 * Math.sin(seconds * 1.7)));
    },
    dispose() {
      for (const object of all) {
        object.traverse((child) => {
          const mesh = child as Points | LineSegments | Sprite;
          // Sprites share one geometry across three.js, so leave it alone.
          if (!(child instanceof Sprite)) mesh.geometry?.dispose();
          const mat = mesh.material as ShaderMaterial | SpriteMaterial | undefined;
          (mat as SpriteMaterial | undefined)?.map?.dispose();
          mat?.dispose();
        });
      }
    },
  };
}

export const SURFACE_COLOR = PALETTE.surface;
