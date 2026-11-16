import { useEffect, useMemo, useRef } from "react";
import { slerp } from "./geo";
import { networkFor, type Network } from "./network";
import { PALETTE } from "./palette";
import { useCountries } from "./useCountries";
import { CAMERA_DISTANCE, DISC_SHARE, GLOBE_VIEW as VIEW, pixelRatioFor, zoomFor } from "./view";

const DEG = Math.PI / 180;
// The still picture is drawn in the moving globe's perspective, so nothing
// shifts when one replaces the other. A point is in view while it is nearer
// the camera than the horizon.
const HORIZON = 1 / CAMERA_DISTANCE;
const REACH = Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - 1);

/**
 * Still picture of the network globe, drawn once with Canvas 2D.
 * Used while WebGL loads, when motion is reduced, and when WebGL is unavailable.
 */
export function StaticGlobe({ reason }: { reason: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const countries = useCountries();
  const network = useMemo(() => (countries.length ? networkFor(countries) : null), [countries]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const draw = () => paint(node, network);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(node);
    return () => observer.disconnect();
  }, [network]);

  return (
    <figure className="static-globe" data-globe="static">
      <canvas ref={canvas} role="img" aria-label="Illustrative network globe" />
      <figcaption className="visually-hidden">{reason}</figcaption>
    </figure>
  );
}

function project(lat: number, lng: number): { x: number; y: number; z: number } {
  const p = lat * DEG;
  const l = (lng - VIEW.lng) * DEG;
  const p0 = VIEW.lat * DEG;
  return {
    x: Math.cos(p) * Math.sin(l),
    y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l),
    z: Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l),
  };
}

function paint(node: HTMLCanvasElement, network: Network | null) {
  const width = node.clientWidth;
  const height = node.clientHeight;
  if (width < 1 || height < 1) return;
  const ratio = pixelRatioFor(width, height);
  node.width = Math.round(width * ratio);
  node.height = Math.round(height * ratio);
  const ctx = node.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const radius = Math.min(width, height) * DISC_SHARE;
  const zoom = zoomFor(width);
  const cx = width / 2;
  const cy = height / 2;
  const at = (lat: number, lng: number, alt = 0) => {
    const v = project(lat, lng);
    const scale = (radius * (1 + alt) * REACH) / (CAMERA_DISTANCE - v.z * (1 + alt));
    return { x: cx + v.x * scale, y: cy - v.y * scale, z: v.z - HORIZON };
  };

  // Near-black disc with a faint rim, so the points define the shape.
  ctx.fillStyle = PALETTE.surface;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(160,160,160,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!network) return;

  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 0.6;
  for (const e of network.edges) {
    const a = at(e.aLat, e.aLng);
    const b = at(e.bLat, e.bLng);
    if (a.z < 0.02 || b.z < 0.02) continue;
    ctx.strokeStyle = `rgba(255,255,255,${(e.aAlpha + e.bAlpha) / 2})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const r of network.rays) {
    const [cr, cg, cb] = r.color.map((c) => Math.round(c * 255));
    ctx.beginPath();
    let started = false;
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      const [lat, lng] = slerp(r.aLat, r.aLng, r.bLat, r.bLng, t);
      const p = at(lat, lng, r.lift * 4 * t * (1 - t));
      if (p.z < 0) break;
      if (started) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      started = true;
    }
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${r.aAlpha * 0.55})`;
    ctx.stroke();
  }
  for (const p of network.points) {
    const q = at(p.lat, p.lng);
    if (q.z < 0.03) continue;
    const [r, g, b] = p.color.map((c) => Math.round(c * 255));
    ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha * 0.8 * Math.min(1, q.z * 5)})`;
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(0.5, p.size * 0.22 * zoom), 0, Math.PI * 2);
    ctx.fill();
  }

  const hub = at(network.hub.lat, network.hub.lng);
  const glow = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, radius * 0.09);
  glow.addColorStop(0, "rgba(255,252,240,1)");
  glow.addColorStop(0.18, "rgba(240,205,130,0.8)");
  glow.addColorStop(0.5, "rgba(217,174,95,0.2)");
  glow.addColorStop(1, "rgba(217,174,95,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(hub.x - radius * 0.1, hub.y - radius * 0.1, radius * 0.2, radius * 0.2);
  ctx.globalCompositeOperation = "source-over";
}
