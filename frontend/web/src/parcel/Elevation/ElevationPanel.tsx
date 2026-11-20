import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ELEVATION } from "../../content/parcel";
import type { LandAssets } from "../ParcelScene/landAssets";
import {
  elevationProfile,
  nearestBoundaryPoint,
  ringInRegion,
  type ElevationAnalysis,
  type ProfileLine,
  type ProfilePoint,
} from "./elevation";

const n = (value: number) => Math.round(value).toLocaleString("en-US");
const pct = (value: number) =>
  `${value < 10 ? value.toFixed(1) : Math.round(value).toString()}%`;

export function ElevationPanel({
  assets,
  boundary,
  analysis,
  line,
  onLineChange,
}: {
  assets: LandAssets;
  boundary: number[][];
  analysis: ElevationAnalysis;
  line: ProfileLine;
  onLineChange: (line: ProfileLine) => void;
}) {
  const samples = useMemo(() => elevationProfile(assets, line), [assets, line]);
  return (
    <section className="elevation-panel" aria-labelledby="elevation-title">
      <div className="elevation-head">
        <div>
          <p className="elevation-kicker">{ELEVATION.kicker}</p>
          <h2 id="elevation-title">{ELEVATION.title}</h2>
        </div>
        <p className="elevation-source">
          <a
            href={assets.meta.elevation.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {ELEVATION.source}
          </a>
          <span>{ELEVATION.notSurvey}</span>
        </p>
      </div>
      <p className="elevation-plain">{analysis.summary}</p>
      <dl className="elevation-stats">
        <Metric label={ELEVATION.lowest} value={`${n(analysis.minFeet)} ft`} />
        <Metric label={ELEVATION.highest} value={`${n(analysis.maxFeet)} ft`} />
        <Metric label={ELEVATION.rise} value={`${n(analysis.riseFeet)} ft`} />
        <Metric
          label={ELEVATION.averageSlope}
          value={pct(analysis.averageSlopePercent)}
        />
        <Metric
          label={ELEVATION.steepestSlope}
          value={pct(analysis.steepestSlopePercent)}
        />
      </dl>
      <div className="elevation-profile">
        <div className="profile-copy">
          <div>
            <h3>{ELEVATION.profile}</h3>
            <p>{ELEVATION.profileHint}</p>
          </div>
          <p className="profile-distance">
            {n(samples.at(-1)?.distanceFeet ?? 0)} ft {ELEVATION.across}
          </p>
        </div>
        <div className="profile-visuals">
          <ProfileSelector
            assets={assets}
            boundary={boundary}
            line={line}
            onChange={onLineChange}
          />
          <ProfileChart samples={samples} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The lot, framed to its own outline at true proportions, with the profile's
 * two ends to drag. Works in ground meters so a long lot reads long.
 */
function ProfileSelector({
  assets,
  boundary,
  line,
  onChange,
}: {
  assets: LandAssets;
  boundary: number[][];
  line: ProfileLine;
  onChange: (line: ProfileLine) => void;
}) {
  const dragging = useRef<"start" | "end" | null>(null);
  const { width: groundW, depth: groundD } = assets.meta.groundMeters;
  const ring = useMemo(
    () => ringInRegion(assets, boundary),
    [assets, boundary],
  );
  const frame = useMemo(() => {
    const xs = ring.map((p) => p.u * groundW);
    const ys = ring.map((p) => p.v * groundD);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const side = Math.max(w, h, 1);
    const pad = side * 0.1;
    // A square frame around the lot's centre, so the lot keeps its shape.
    return {
      x: minX + w / 2 - side / 2 - pad,
      y: minY + h / 2 - side / 2 - pad,
      size: side + pad * 2,
    };
  }, [ring, groundW, groundD]);
  const points = ring
    .map(({ u, v }) => `${u * groundW},${v * groundD}`)
    .join(" ");
  const handle = frame.size * 0.045;

  const move = (which: "start" | "end", point: ProfilePoint) => {
    onChange({ ...line, [which]: nearestBoundaryPoint(point, ring) });
  };
  const fromEvent = (event: PointerEvent<SVGSVGElement>): ProfilePoint => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = frame.x + ((event.clientX - box.left) / box.width) * frame.size;
    const y = frame.y + ((event.clientY - box.top) / box.height) * frame.size;
    return { u: x / groundW, v: y / groundD };
  };
  const keyMove = (
    event: KeyboardEvent<SVGGElement>,
    which: "start" | "end",
  ) => {
    const stepX = (frame.size * 0.03) / groundW;
    const stepY = (frame.size * 0.03) / groundD;
    const delta: Record<string, ProfilePoint> = {
      ArrowLeft: { u: -stepX, v: 0 },
      ArrowRight: { u: stepX, v: 0 },
      ArrowUp: { u: 0, v: -stepY },
      ArrowDown: { u: 0, v: stepY },
    };
    const by = delta[event.key];
    if (!by) return;
    event.preventDefault();
    const current = line[which];
    move(which, { u: current.u + by.u, v: current.v + by.v });
  };

  return (
    <svg
      className="profile-selector"
      viewBox={`${frame.x} ${frame.y} ${frame.size} ${frame.size}`}
      role="group"
      aria-label={ELEVATION.selectorLabel}
      onPointerMove={(event) => {
        if (dragging.current) move(dragging.current, fromEvent(event));
      }}
      onPointerUp={(event) => {
        if (dragging.current) move(dragging.current, fromEvent(event));
        dragging.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
    >
      <polygon className="profile-lot" points={points} />
      <line
        className="profile-cut"
        x1={line.start.u * groundW}
        y1={line.start.v * groundD}
        x2={line.end.u * groundW}
        y2={line.end.v * groundD}
      />
      {(["start", "end"] as const).map((which, index) => {
        const point = line[which];
        const cx = point.u * groundW;
        const cy = point.v * groundD;
        return (
          <g
            key={which}
            className="profile-handle"
            role="slider"
            tabIndex={0}
            aria-label={ELEVATION.handle(index + 1)}
            aria-valuetext={ELEVATION.handlePlace(cx - frame.x, cy - frame.y)}
            onKeyDown={(event) => keyMove(event, which)}
            onPointerDown={(event) => {
              dragging.current = which;
              event.currentTarget.ownerSVGElement?.setPointerCapture(
                event.pointerId,
              );
            }}
          >
            {/* A wider, invisible ring makes the end easy to grab by touch. */}
            <circle className="profile-hit" cx={cx} cy={cy} r={handle * 2} />
            <circle cx={cx} cy={cy} r={handle} />
            <text x={cx} y={cy} dy="0.35em" fontSize={handle * 1.2}>
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ProfileChart({
  samples,
}: {
  samples: readonly { distanceFeet: number; elevationFeet: number }[];
}) {
  // Drawn in CSS pixels at the chart's real width, so its labels stay legible
  // on a phone instead of shrinking with a fixed viewBox.
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(460);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () =>
      setWidth(Math.max(200, Math.round(element.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = width < 360 ? 150 : 180;
  const left = 50;
  const right = 14;
  const top = 14;
  const bottom = 28;
  const min = Math.min(...samples.map((sample) => sample.elevationFeet));
  const max = Math.max(...samples.map((sample) => sample.elevationFeet));
  const padding = Math.max(1, (max - min) * 0.18);
  const floor = min - padding;
  const ceiling = max + padding;
  const distance = samples.at(-1)?.distanceFeet ?? 0;
  const x = (value: number) =>
    left + (value / (distance || 1)) * (width - left - right);
  const y = (value: number) =>
    top + ((ceiling - value) / (ceiling - floor)) * (height - top - bottom);
  const points = samples
    .map((sample) => `${x(sample.distanceFeet)},${y(sample.elevationFeet)}`)
    .join(" ");
  const area = `${left},${height - bottom} ${points} ${width - right},${height - bottom}`;

  return (
    <div ref={frame} className="profile-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={ELEVATION.chartLabel(n(min), n(max), n(distance))}
      >
        {[0, 0.5, 1].map((amount) => {
          const at = top + amount * (height - top - bottom);
          const value = ceiling - amount * (ceiling - floor);
          return (
            <g key={amount}>
              <line
                className="profile-grid"
                x1={left}
                x2={width - right}
                y1={at}
                y2={at}
              />
              <text
                className="profile-axis"
                x={left - 7}
                y={at + 4}
                textAnchor="end"
              >
                {n(value)} ft
              </text>
            </g>
          );
        })}
        <polygon className="profile-area" points={area} />
        <polyline className="profile-line" points={points} />
        <text className="profile-axis" x={left} y={height - 8}>
          0 ft
        </text>
        <text
          className="profile-axis"
          x={width - right}
          y={height - 8}
          textAnchor="end"
        >
          {n(distance)} ft
        </text>
        <text
          className="profile-end"
          x={x(0)}
          y={y(samples[0]?.elevationFeet ?? min) - 8}
        >
          1
        </text>
        <text
          className="profile-end"
          x={x(distance)}
          y={y(samples.at(-1)?.elevationFeet ?? max) - 8}
          textAnchor="end"
        >
          2
        </text>
      </svg>
    </div>
  );
}
