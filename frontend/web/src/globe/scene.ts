// Illustrative network activity for the homepage globe.
// Nothing here is live chain data: every transaction is generated on the client.

export type TxKind = "transfer" | "settlement" | "hold";

export interface City {
  name: string;
  lat: number;
  lng: number;
}

export interface GlobeArc {
  id: number;
  kind: TxKind;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
  label: string;
}

export interface GlobeRing {
  id: number;
  lat: number;
  lng: number;
  color: string;
}

export const PALETTE = {
  surface: "#0A0A0A",
  dot: "rgba(214, 214, 214, 0.32)",
  dotHover: "rgba(240, 240, 240, 0.95)",
  border: "rgba(232, 232, 232, 0.7)",
  transfer: "rgba(245, 245, 245, 0.95)",
  green: "#3FA86A",
  red: "#D64545",
  gold: "#C4A15A",
} as const;

// Ohio is the hub: it's where GroundTruth's parcel coverage starts.
export const HUB: City = { name: "Columbus, Ohio", lat: 39.96, lng: -82.99 };

export const CITIES: City[] = [
  HUB,
  { name: "Cleveland, Ohio", lat: 41.5, lng: -81.69 },
  { name: "Cincinnati, Ohio", lat: 39.1, lng: -84.51 },
  { name: "New York", lat: 40.71, lng: -74.01 },
  { name: "Austin", lat: 30.27, lng: -97.74 },
  { name: "San Francisco", lat: 37.77, lng: -122.42 },
  { name: "Chicago", lat: 41.88, lng: -87.63 },
  { name: "Miami", lat: 25.76, lng: -80.19 },
  { name: "Toronto", lat: 43.65, lng: -79.38 },
  { name: "Mexico City", lat: 19.43, lng: -99.13 },
  { name: "São Paulo", lat: -23.55, lng: -46.63 },
  { name: "Buenos Aires", lat: -34.6, lng: -58.38 },
  { name: "Bogotá", lat: 4.71, lng: -74.07 },
  { name: "London", lat: 51.51, lng: -0.13 },
  { name: "Paris", lat: 48.86, lng: 2.35 },
  { name: "Berlin", lat: 52.52, lng: 13.4 },
  { name: "Zurich", lat: 47.38, lng: 8.54 },
  { name: "Lisbon", lat: 38.72, lng: -9.14 },
  { name: "Lagos", lat: 6.52, lng: 3.38 },
  { name: "Nairobi", lat: -1.29, lng: 36.82 },
  { name: "Cape Town", lat: -33.92, lng: 18.42 },
  { name: "Dubai", lat: 25.2, lng: 55.27 },
  { name: "Mumbai", lat: 19.08, lng: 72.88 },
  { name: "Singapore", lat: 1.35, lng: 103.82 },
  { name: "Hong Kong", lat: 22.32, lng: 114.17 },
  { name: "Seoul", lat: 37.57, lng: 126.98 },
  { name: "Tokyo", lat: 35.68, lng: 139.69 },
  { name: "Sydney", lat: -33.87, lng: 151.21 },
  { name: "Auckland", lat: -36.85, lng: 174.76 },
];

const KIND_COLOR: Record<TxKind, string> = {
  transfer: PALETTE.transfer,
  settlement: PALETTE.green,
  hold: PALETTE.red,
};

const KIND_LABEL: Record<TxKind, string> = {
  transfer: "Transfer",
  settlement: "Settlement released",
  hold: "Payout held",
};

let nextId = 0;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function pickKind(): TxKind {
  const roll = Math.random();
  if (roll < 0.14) return "settlement";
  if (roll < 0.22) return "hold";
  return "transfer";
}

/** One illustrative transaction between two cities. About a third touch the Ohio hub. */
export function randomTransaction(): GlobeArc {
  const start = Math.random() < 0.33 ? HUB : pick(CITIES);
  let end = pick(CITIES);
  while (end === start) end = pick(CITIES);
  const kind = pickKind();
  const color = KIND_COLOR[kind];
  return {
    id: nextId++,
    kind,
    startLat: start.lat,
    startLng: start.lng,
    endLat: end.lat,
    endLng: end.lng,
    color: [color, color],
    label: `Illustrative · ${KIND_LABEL[kind]} · ${start.name} → ${end.name}`,
  };
}

export function ringFor(arc: GlobeArc): GlobeRing {
  return {
    id: arc.id,
    lat: arc.endLat,
    lng: arc.endLng,
    color: arc.color[1],
  };
}

// ---------------------------------------------------------------------------
// Network scaffolding: a thin mesh of nodes and edges wrapping the planet.

export interface MeshEdge {
  points: [number, number][]; // [lat, lng]
}

function fibonacciSphere(count: number): { lat: number; lng: number; v: [number, number, number] }[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: { lat: number; lng: number; v: [number, number, number] }[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    out.push({
      lat: (Math.asin(y) * 180) / Math.PI,
      lng: (Math.atan2(z, x) * 180) / Math.PI,
      v: [x, y, z],
    });
  }
  return out;
}

/** Connect each node to its nearest neighbors, so the sphere reads as a neural net. */
export function buildMesh(nodeCount = 520, neighbors = 3): MeshEdge[] {
  const nodes = fibonacciSphere(nodeCount);
  const seen = new Set<string>();
  const edges: MeshEdge[] = [];
  nodes.forEach((a, i) => {
    const nearest = nodes
      .map((b, j) => ({
        j,
        d: a.v[0] * b.v[0] + a.v[1] * b.v[1] + a.v[2] * b.v[2],
      }))
      .filter((item) => item.j !== i)
      .sort((p, q) => q.d - p.d)
      .slice(0, neighbors);
    nearest.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) return;
      seen.add(key);
      const b = nodes[j]!;
      edges.push({ points: [[a.lat, a.lng], [b.lat, b.lng]] });
    });
  });
  return edges;
}
