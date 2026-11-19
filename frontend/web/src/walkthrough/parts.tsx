import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EXAMPLE } from "../content/example";
import { WALKTHROUGH } from "../content/walkthrough";
import { EXAMPLE_PARCEL } from "../example/exampleFixture";
import { useReducedMotion } from "../home/useReducedMotion";
import { mercatorX, mercatorY, outerRing } from "../parcel/ParcelScene/landMeta";

/**
 * Which beat of a scene is showing: 0 at first, then i + 1 once `times[i]`
 * milliseconds have passed since the scene mounted. With reduced motion the
 * scene opens on its last beat. `times` must be a stable (module) array.
 */
export function usePhase(times: readonly number[]): number {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timers = times.map((ms, index) => window.setTimeout(() => setPhase(index + 1), ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced, times]);
  return reduced ? times.length : phase;
}

/** `text`, typed out a character at a time from `startMs` (all at once with reduced motion). */
export function useTyped(text: string, startMs: number, perCharMs = 60): string {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let timer = window.setTimeout(function tick() {
      setCount((n) => {
        if (n + 1 < text.length) timer = window.setTimeout(tick, perCharMs);
        return n + 1;
      });
    }, startMs);
    return () => window.clearTimeout(timer);
  }, [reduced, text, startMs, perCharMs]);
  return reduced ? text : text.slice(0, count);
}

/** Seconds since `running` turned true, as "0:07"; `fallback` with reduced motion. */
export function useClock(running: boolean, fallback: string): string {
  const reduced = useReducedMotion();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running || reduced) return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, reduced]);
  if (reduced) return fallback;
  return `0:${String(seconds).padStart(2, "0")}`;
}

/** A phone, drawn: the screen is whatever is inside. Decorative chrome only. */
export function PhoneFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="walk-phone" aria-label={label}>
      <div className="walk-phone-screen">
        <div className="walk-phone-status" aria-hidden="true">
          <span>9:41</span>
          <span className="walk-phone-island" />
          <span className="walk-phone-icons">
            <i />
            <i />
            <i />
          </span>
        </div>
        {children}
      </div>
    </figure>
  );
}

/** A sheet of paper with a document on it, marked as an example. */
export function Paper({ children, kind }: { children: ReactNode; kind: string }) {
  return (
    <div className="walk-paper" data-kind={kind} aria-hidden="true">
      {children}
      <span className="walk-paper-stamp">{EXAMPLE.tag.data}</span>
    </div>
  );
}

function Lines({ count, short = false }: { count: number; short?: boolean }) {
  return (
    <span className="walk-paper-lines" data-short={short || undefined}>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

export function TitlePaper() {
  return (
    <Paper kind="title">
      <b className="walk-paper-head">{WALKTHROUGH.titleDoc.heading}</b>
      <small>{WALKTHROUGH.titleDoc.scheduleA}</small>
      <Lines count={3} />
      <small>{WALKTHROUGH.titleDoc.requirements}</small>
      <Lines count={3} short />
      <small>{WALKTHROUGH.titleDoc.scheduleB}</small>
      <span className="walk-paper-item">1. {WALKTHROUGH.titleDoc.easement}</span>
      <Lines count={4} short />
      <span className="walk-paper-sign">{WALKTHROUGH.titleDoc.sign}</span>
    </Paper>
  );
}

/** The lot's own outline, as a surveyor's plat: corner pins and side lengths in feet. */
export function PlatPaper() {
  const plat = useMemo(() => {
    const ring = outerRing(EXAMPLE_PARCEL.geometry.geojson).slice(0, -1);
    const k = Math.cos((EXAMPLE_PARCEL.centroid.latitude * Math.PI) / 180);
    const points = ring.map(([lon = 0, lat = 0]) => [mercatorX(lon) * k, -mercatorY(lat) * k] as const);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const size = Math.max(maxX - minX, maxY - minY);
    const fit = (x: number, y: number): [number, number] => [
      14 + ((x - minX) / size) * 72 + (72 - ((maxX - minX) / size) * 72) / 2,
      14 + ((y - minY) / size) * 72 + (72 - ((maxY - minY) / size) * 72) / 2,
    ];
    const pins = points.map(([x, y]) => fit(x, y));
    const sides = points.map(([x1, y1], index) => {
      const [x2, y2] = points[(index + 1) % points.length]!;
      const [a, b] = [pins[index]!, pins[(index + 1) % pins.length]!];
      return {
        feet: Math.round(Math.hypot(x2 - x1, y2 - y1) * 3.28084),
        at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const,
      };
    });
    // The road runs along the first side (the frontage), just outside the lot.
    const [a, b] = [pins[0]!, pins[1]!];
    const [cx, cy] = [
      pins.reduce((sum, pin) => sum + pin[0], 0) / pins.length,
      pins.reduce((sum, pin) => sum + pin[1], 0) / pins.length,
    ];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let [nx, ny] = [-uy, ux];
    if ((a[0] - cx) * nx + (a[1] - cy) * ny < 0) [nx, ny] = [-nx, -ny];
    const off = 6;
    const road = `M ${a[0] - ux * 30 + nx * off} ${a[1] - uy * 30 + ny * off} L ${b[0] + ux * 30 + nx * off} ${b[1] + uy * 30 + ny * off}`;
    return { pins, sides, road };
  }, []);
  return (
    <Paper kind="plat">
      <b className="walk-paper-head">{WALKTHROUGH.plat.title}</b>
      <svg className="walk-plat" viewBox="0 0 100 100">
        <path className="walk-plat-road" d={plat.road} />
        <polygon className="walk-plat-lot" points={plat.pins.map((pin) => pin.join(",")).join(" ")} />
        {plat.sides.map((side, index) => (
          <text key={index} className="walk-plat-dim" x={side.at[0]} y={side.at[1]}>
            {side.feet}′
          </text>
        ))}
        {plat.pins.map(([x, y], index) => (
          <circle key={index} className="walk-plat-pin" cx={x} cy={y} r="1.6" />
        ))}
        <text className="walk-plat-north" x="8" y="12">
          N↑
        </text>
      </svg>
      <small>
        {WALKTHROUGH.plat.pins} · {WALKTHROUGH.plat.acres}
      </small>
    </Paper>
  );
}

export function SoilPaper() {
  return (
    <Paper kind="soil">
      <b className="walk-paper-head">{WALKTHROUGH.soil.heading}</b>
      <span className="walk-soil" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <small>{WALKTHROUGH.soil.rating}</small>
    </Paper>
  );
}

export function LetterPaper() {
  return (
    <Paper kind="letter">
      <small className="walk-paper-from">{WALKTHROUGH.letter.from}</small>
      <b className="walk-paper-head">{WALKTHROUGH.letter.heading}</b>
      <span className="walk-paper-item">{WALKTHROUGH.letter.parcel}</span>
      <span className="walk-paper-item">{WALKTHROUGH.letter.districts}</span>
      <span className="walk-paper-item">{WALKTHROUGH.letter.use}</span>
      <ZoningSketch />
      <Lines count={2} short />
      <span className="walk-paper-sign">{WALKTHROUGH.letter.sign}</span>
    </Paper>
  );
}

/** The lot with its district line, as a letter's inset map. */
function ZoningSketch() {
  return (
    <svg className="walk-paper-map" viewBox="0 0 120 52" preserveAspectRatio="xMidYMid meet">
      <path d="M 72 -4 L 112 56" stroke="#c9c3b3" strokeWidth="6" fill="none" />
      <polygon points="66,6 98,44 66,50 46,40 34,20" fill="rgba(196,161,90,0.18)" stroke="#2b2b2b" strokeWidth="0.8" />
      <path d="M 52 -4 L 92 56" stroke="#d1457f" strokeWidth="1" strokeDasharray="3 2" fill="none" />
      <text x="48" y="32" fontSize="7" fontWeight="700" fill="#d1457f">R</text>
      <text x="74" y="30" fontSize="7" fontWeight="700" fill="#d1457f">NC</text>
    </svg>
  );
}

/** "284 KB", "1.9 MB". */
export function fileSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
}
