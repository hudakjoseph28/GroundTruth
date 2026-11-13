// The illustrative network that makes up the globe. Pure data, no three.js, so the
// static fallback can draw the same picture. Nothing here is live chain data.
import { CITIES, HUB } from "./cities";
import { arcDegrees, landTester, seeded, unit } from "./geo";
import { PALETTE, rgb, type RGB } from "./palette";
import type { CountryFeature } from "./useCountries";

export interface GlobePoint {
  lat: number;
  lng: number;
  /** Sprite size in CSS pixels, including the tight halo. */
  size: number;
  color: RGB;
  /** 0..1 brightness, premultiplied into the color when drawn. */
  alpha: number;
  /** Altitude as a fraction of the globe radius. */
  alt: number;
}

export interface NetworkEdge {
  aLat: number;
  aLng: number;
  bLat: number;
  bLng: number;
  /** Brightness at the a end and the b end. */
  aAlpha: number;
  bAlpha: number;
  color: RGB;
  /** Peak lift above the surface, as a fraction of the radius. 0 hugs the surface. */
  lift: number;
}

export interface Pulse {
  edge: NetworkEdge;
  /** Where in its cycle the pulse starts, 0..1. */
  phase: number;
  /** Cycles per second. */
  speed: number;
}

export interface Network {
  points: GlobePoint[];
  halo: GlobePoint[];
  edges: NetworkEdge[];
  rays: NetworkEdge[];
  pulses: Pulse[];
  hub: { lat: number; lng: number };
}

const WHITE = rgb("#ffffff");
const GRAY = rgb("#b9bcc2");
const GOLD = rgb(PALETTE.gold);
const GREEN = rgb(PALETTE.green);
const RED = rgb(PALETTE.red);

// Fixed so the accents always land in the same recognisable places.
const GREEN_AT: [number, number][] = [
  [47.6, -122.3],
  [51.5, 4.5],
  [-23.5, -46.6],
  [-1.3, 36.8],
  [35.7, 139.7],
  [33.7, -84.4],
];
const RED_AT: [number, number][] = [
  [19.4, -99.1],
  [18.5, -70.0],
  [55.8, 37.6],
  [28.6, 77.2],
];

const CANDIDATES = 44000;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function buildNetwork(countries: CountryFeature[]): Network {
  const rand = seeded(20261121);
  const isLand = countries.length ? landTester(countries) : () => false;
  const land: [number, number][] = [];
  const ocean: [number, number][] = [];

  // 1. Even candidates over the sphere, jittered so no grid shows. Land keeps them all.
  for (let i = 0; i < CANDIDATES; i++) {
    const y = 1 - ((i + 0.5) / CANDIDATES) * 2;
    let lat = (Math.asin(y) * 180) / Math.PI;
    if (lat < -62) continue;
    let lng = ((((GOLDEN * i * 180) / Math.PI) % 360) + 360) % 360 - 180;
    lat += (rand() - 0.5) * 0.7;
    lng += ((rand() - 0.5) * 0.7) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    if (isLand(lat, lng)) land.push([lat, lng]);
    else if (rand() < 0.045) ocean.push([lat, lng]);
  }

  // 2. Denser clusters around cities and the Ohio hub, like settlements seen at night.
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
  const cluster = (lat: number, lng: number, count: number, spread: number) => {
    for (let i = 0; i < count; i++) {
      const pLat = lat + gauss() * spread;
      const pLng = lng + (gauss() * spread) / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
      if (isLand(pLat, pLng)) land.push([pLat, pLng]);
    }
  };
  for (const city of CITIES) cluster(city.lat, city.lng, 55, 1.8);
  cluster(HUB.lat, HUB.lng, 260, 5.5);
  cluster(40, -100, 260, 10);

  const points: GlobePoint[] = [];
  for (const [lat, lng] of land) {
    const tone = rand();
    const gray = tone < 0.38;
    points.push({
      lat,
      lng,
      size: 2.8 + rand() * 1.6,
      color: gray ? GRAY : WHITE,
      alpha: gray ? 0.4 + rand() * 0.2 : 0.65 + rand() * 0.35,
      alt: 0.004,
    });
  }
  for (const [lat, lng] of ocean) {
    points.push({ lat, lng, size: 2.6, color: GRAY, alpha: 0.3 + rand() * 0.2, alt: 0.004 });
  }

  // 3. Neurons: a sparse subset, biased to land, wired to a few irregular neighbors.
  type Node = { lat: number; lng: number; v: [number, number, number]; onLand: boolean };
  const nodes: Node[] = [];
  for (const [lat, lng] of land)
    if (rand() < 0.055) nodes.push({ lat, lng, v: unit(lat, lng), onLand: true });
  for (const [lat, lng] of ocean)
    if (rand() < 0.6) nodes.push({ lat, lng, v: unit(lat, lng), onLand: false });

  const edges: NetworkEdge[] = [];
  const seen = new Set<number>();
  const link = (i: number, j: number) => {
    const key = i < j ? i * 100000 + j : j * 100000 + i;
    if (i === j || seen.has(key)) return;
    seen.add(key);
    const a = nodes[i]!;
    const b = nodes[j]!;
    const base = 0.1 + rand() * 0.14 + (a.onLand && b.onLand ? 0.06 : 0);
    edges.push({
      aLat: a.lat,
      aLng: a.lng,
      bLat: b.lat,
      bLng: b.lng,
      aAlpha: base,
      bAlpha: base * (0.6 + rand() * 0.6),
      color: WHITE,
      lift: 0,
    });
  };
  const maxDot = Math.cos((9 * Math.PI) / 180);
  nodes.forEach((a, i) => {
    const near: { j: number; d: number }[] = [];
    nodes.forEach((b, j) => {
      if (j === i) return;
      const d = a.v[0] * b.v[0] + a.v[1] * b.v[1] + a.v[2] * b.v[2];
      if (d < maxDot) return;
      near.push({ j, d });
    });
    near.sort((p, q) => q.d - p.d);
    const top = near.slice(0, 12);
    if (top[0]) link(i, top[0].j);
    if (top[1] && rand() < 0.85) link(i, top[1].j);
    if (top[2] && rand() < 0.45) link(i, top[2].j);
    if (top.length > 5 && rand() < 0.18) link(i, top[5 + Math.floor(rand() * (top.length - 5))]!.j);
  });

  // Neuron dots sit on top of the land dust, slightly larger and brighter.
  for (const node of nodes) {
    points.push({
      lat: node.lat,
      lng: node.lng,
      size: node.onLand ? 3.6 + rand() * 1.2 : 3 + rand(),
      color: WHITE,
      alpha: node.onLand ? 0.8 + rand() * 0.2 : 0.5 + rand() * 0.2,
      alt: 0.005,
    });
  }

  // 4. A handful of meaning-colored accents: green settled, red held.
  const nearestNode = (lat: number, lng: number) => {
    const v = unit(lat, lng);
    let best = nodes[0]!;
    let bestDot = -2;
    for (const node of nodes) {
      const d = v[0] * node.v[0] + v[1] * node.v[1] + v[2] * node.v[2];
      if (d > bestDot) {
        bestDot = d;
        best = node;
      }
    }
    return best;
  };
  if (nodes.length) {
    for (const [lat, lng] of GREEN_AT) {
      const n = nearestNode(lat, lng);
      points.push({ lat: n.lat, lng: n.lng, size: 12, color: GREEN, alpha: 1, alt: 0.006 });
    }
    for (const [lat, lng] of RED_AT) {
      const n = nearestNode(lat, lng);
      points.push({ lat: n.lat, lng: n.lng, size: 12, color: RED, alpha: 1, alt: 0.006 });
    }
  }

  // 5. Gold rays out of the Ohio hub, plus a white starburst to its nearest neurons.
  const rays: NetworkEdge[] = [];
  const ray = (lat: number, lng: number, strength: number, color: RGB) => {
    const length = arcDegrees(HUB.lat, HUB.lng, lat, lng);
    if (length < 1.5 || length > 80) return;
    rays.push({
      aLat: HUB.lat,
      aLng: HUB.lng,
      bLat: lat,
      bLng: lng,
      aAlpha: strength,
      bAlpha: strength * 0.1,
      color,
      lift: Math.min(0.05, length / 1400),
    });
  };
  for (const city of CITIES) if (!city.name.includes("Ohio")) ray(city.lat, city.lng, 1, GOLD);
  const close = nodes
    .map((node) => ({ node, d: arcDegrees(HUB.lat, HUB.lng, node.lat, node.lng) }))
    .sort((p, q) => p.d - q.d);
  close.slice(0, 22).forEach(({ node }) => ray(node.lat, node.lng, 0.6, WHITE));
  close
    .filter(({ d }) => d > 6 && d < 55)
    .filter(() => rand() < 0.3)
    .slice(0, 30)
    .forEach(({ node }) => ray(node.lat, node.lng, 0.6, GOLD));

  // 6. A few white pulses travelling along the web and out along the rays.
  const pulses: Pulse[] = [];
  const longish = edges.filter((e) => arcDegrees(e.aLat, e.aLng, e.bLat, e.bLng) > 3);
  for (let i = 0; i < 46 && longish.length; i++) {
    const edge = longish[Math.floor(rand() * longish.length)]!;
    pulses.push({ edge, phase: rand(), speed: 0.08 + rand() * 0.08 });
  }
  rays
    .filter((r) => r.color === GOLD)
    .forEach((edge, i) => {
      if (i % 2 === 0) pulses.push({ edge, phase: rand(), speed: 0.06 + rand() * 0.05 });
    });

  // 7. Faint dust just above the surface, so the planet sits in a loose cloud.
  const halo: GlobePoint[] = [];
  for (let i = 0; i < 520; i++) {
    const y = rand() * 2 - 1;
    halo.push({
      lat: (Math.asin(y) * 180) / Math.PI,
      lng: rand() * 360 - 180,
      size: 1.6 + rand() * 1.4,
      color: rand() < 0.5 ? WHITE : GRAY,
      alpha: 0.18 + rand() * 0.3,
      alt: 0.02 + Math.pow(rand(), 2) * 0.28,
    });
  }

  return { points, halo, edges, rays, pulses, hub: { lat: HUB.lat, lng: HUB.lng } };
}

const cache = new WeakMap<CountryFeature[], Network>();

/** Build once per country list; the static fallback and the WebGL globe share it. */
export function networkFor(countries: CountryFeature[]): Network {
  let network = cache.get(countries);
  if (!network) {
    network = buildNetwork(countries);
    cache.set(countries, network);
  }
  return network;
}
