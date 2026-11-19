import type { ReactNode } from "react";
import type { RoadmapIcon } from "../content/roadmap";
import { BLOCK, BLOCK_EDGES } from "../home/icons";

// The roadmap's line icons and small sketches. All decorative: each card's
// title and sentences carry the meaning, and every sketch is captioned
// "Illustration" on the card. Colors keep their usual jobs: gold for the lot in
// view or a pending step, green for signed or released, red for held.

const ICONS: Record<RoadmapIcon, ReactNode> = {
  search: (
    <>
      <circle cx="7" cy="7" r="4.6" />
      <path d="m10.5 10.5 3.4 3.4" />
    </>
  ),
  report: (
    <>
      <path d="M3.6 1.8h5.6l3.2 3.2v9.2H3.6Z" />
      <path d="M9.2 1.8V5h3.2M5.8 8.2h4.4M5.8 10.8h4.4" />
    </>
  ),
  escrow: (
    <>
      <path d={BLOCK} />
      <path d={BLOCK_EDGES} />
    </>
  ),
  reviewer: (
    <>
      <path d="M5.6 3H3.4v11.2h9.2V3h-2.2" />
      <path d="M5.6 1.8h4.8v2.4H5.6ZM5.7 9.5l1.6 1.6 3.1-3.4" />
    </>
  ),
  live: <path d="M1.6 8h2.6l1.6-4.4 2.8 8.8 1.8-6.2 1.2 1.8h2.8" />,
  pilot: (
    <>
      <path d="M2.4 14.2V5.6L8 2l5.6 3.6v8.6" />
      <path d="M1.4 14.2h13.2M6.2 14.2v-4h3.6v4" />
    </>
  ),
  mainnet: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c1.9 1.7 2.8 3.8 2.8 6.2S9.9 12.5 8 14.2C6.1 12.5 5.2 10.4 5.2 8S6.1 3.5 8 1.8Z" />
    </>
  ),
  qr: (
    <>
      <path d="M2.2 2.2h4.4v4.4H2.2ZM9.4 2.2h4.4v4.4H9.4ZM2.2 9.4h4.4v4.4H2.2Z" />
      <path d="M9.4 9.4h1.8v1.8M13.8 9.4v4.4H11.2" />
    </>
  ),
  credential: (
    <>
      <path d="M8 1.6 13.2 3.6v4c0 3.2-2.2 5.6-5.2 6.8C5 13.2 2.8 10.8 2.8 7.6v-4Z" />
      <path d="M5.6 8 7.3 9.7 10.5 6.3" />
    </>
  ),
  checks: (
    <>
      <path d="M2 4.2h12M2 8h12M2 11.8h12" />
      <circle cx="5" cy="4.2" r="1.3" />
      <circle cx="10.6" cy="8" r="1.3" />
      <circle cx="7" cy="11.8" r="1.3" />
    </>
  ),
  nation: (
    <>
      <path d="M1.8 5.4 6 3.2l4 2 4.2-2.2v7.4L10 12.6l-4-2-4.2 2.2Z" />
      <path d="M6 3.2v7.4M10 5.2v7.4" />
    </>
  ),
  deed: (
    <>
      <path d="M3.4 1.8h9.2v12.4H3.4Z" />
      <path d="M5.6 5h4.8M5.6 7.6h4.8M5.6 10.2h2.6" />
      <circle cx="10.6" cy="11.4" r="1.4" />
    </>
  ),
  identity: (
    <>
      <rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.4" />
      <circle cx="5.6" cy="7.2" r="1.6" />
      <path d="M3.4 11c.4-1.2 1.2-1.8 2.2-1.8s1.8.6 2.2 1.8M9.6 6.4h3M9.6 9h2.2" />
    </>
  ),
  milestone: (
    <>
      <path d="M1.6 10h12.8" />
      <circle cx="3.6" cy="10" r="1.4" />
      <circle cx="8" cy="10" r="1.4" />
      <circle cx="12.4" cy="10" r="1.4" />
      <path d="M8 2.4v3.4l2 1.2" />
    </>
  ),
  ask: (
    <>
      <path d="M2.2 3.2h11.6v7.6H7.4l-3 2.6v-2.6H2.2Z" />
      <path d="M5 6h6M5 8.2h3.6" />
    </>
  ),
  alert: (
    <>
      <path d="M4 11.4V7.2a4 4 0 0 1 8 0v4.2l1.2 1.2H2.8Z" />
      <path d="M6.6 14.2a1.5 1.5 0 0 0 2.8 0" />
    </>
  ),
};

export function RoadmapGlyph({ name }: { name: RoadmapIcon }) {
  return (
    <svg className="rm-icon" viewBox="0 0 16 16" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** A row of a report: a label bar and a status dot. */
function Row({ y, tone, width = 74 }: { y: number; tone: "green" | "gold" | "dim"; width?: number }) {
  return (
    <>
      <circle className={`rm-dot rm-${tone}-fill`} cx="78" cy={y} r="3.4" />
      <path className="rm-text" d={`M90 ${y}h${width}`} />
    </>
  );
}

/** A wallet sketch: a rounded rectangle with its clasp. */
function Wallet({ x, y, tone = "line" }: { x: number; y: number; tone?: string }) {
  return (
    <g className={`rm-${tone}`} transform={`translate(${x} ${y})`}>
      <rect width="30" height="21" rx="4" />
      <path d="M30 7h-8a3.5 3.5 0 0 0 0 7h8" />
    </g>
  );
}

const ART: Record<RoadmapIcon, ReactNode> = {
  search: (
    <>
      <rect className="rm-line rm-panel" x="24" y="14" width="96" height="20" rx="10" />
      <circle className="rm-dim" cx="38" cy="24" r="4.4" />
      <path className="rm-dim" d="m41.4 27.4 3.4 3.4M54 24h44" />
      <path className="rm-grid" d="M20 84h200M40 62v44M80 62v44M120 62v44M160 62v44M200 62v44M20 106h200" />
      <path className="rm-line" d="M128 52 176 44 208 66 196 98 140 102 118 80Z" />
      <path className="rm-gold rm-boundary" d="M136 58 172 52 196 70 186 92 146 95 130 78Z" />
      <circle className="rm-gold-fill" cx="164" cy="74" r="3" />
    </>
  ),
  report: (
    <>
      <rect className="rm-line rm-panel" x="60" y="10" width="120" height="92" rx="8" />
      <path className="rm-strong" d="M74 26h52" />
      <Row y={44} tone="green" />
      <Row y={60} tone="gold" width={62} />
      <Row y={76} tone="green" width={68} />
      <Row y={92} tone="dim" width={50} />
    </>
  ),
  escrow: (
    <>
      <g className="rm-line">
        <path d="M108 30 120 23l12 7v14l-12 7-12-7Z" />
        <path d="M120 37 108 30m12 7 12-7m-12 7v14" />
      </g>
      <Wallet x={20} y={26} />
      <path className="rm-line" d="M52 37h50" />
      <circle className="rm-gold-fill" cx="78" cy="37" r="3" />
      <Wallet x={190} y={14} tone="red" />
      <path className="rm-red" d="M138 33 C 156 30, 168 26, 186 24" strokeDasharray="3 4" />
      <path className="rm-red" d="m158 22 8 8m0-8-8 8" />
      <Wallet x={190} y={60} tone="green" />
      <path className="rm-green" d="M138 44 C 156 52, 168 66, 186 70" />
      <path className="rm-green" d="m180 64 6 6-7 4" />
      <path className="rm-text" d="M100 70h40M100 82h28" />
      <rect className="rm-red" x="20" y="74" width="22" height="18" rx="3" />
      <path className="rm-red" d="M25 74v-4a6 6 0 0 1 12 0v4" />
    </>
  ),
  reviewer: (
    <>
      <rect className="rm-line rm-panel" x="34" y="8" width="54" height="96" rx="9" />
      <path className="rm-dim" d="M54 15h14" />
      <path className="rm-text" d="M44 32h34M44 42h24" />
      <rect className="rm-green" x="44" y="60" width="34" height="13" rx="4" />
      <rect className="rm-red" x="44" y="80" width="34" height="13" rx="4" />
      <rect className="rm-line rm-panel" x="116" y="20" width="58" height="72" rx="6" />
      <path className="rm-text" d="M126 36h38M126 46h30M126 56h34" />
      <path className="rm-gold" d="M126 74h6m4 0h6m4 0h6m4 0h6" />
      <path className="rm-dim" d="M174 74h20" strokeDasharray="2 3" />
      <g className="rm-gold">
        <path d="M196 64 206 58l10 6v12l-10 6-10-6Z" />
      </g>
    </>
  ),
  live: (
    <>
      <path className="rm-line" d="M44 14v86" />
      <circle className="rm-green-fill" cx="44" cy="24" r="4" />
      <path className="rm-text" d="M58 24h70" />
      <circle className="rm-green-fill" cx="44" cy="48" r="4" />
      <path className="rm-text" d="M58 48h56" />
      <circle className="rm-gold-fill rm-pulse" cx="44" cy="72" r="4" />
      <path className="rm-text" d="M58 72h64" />
      <circle className="rm-dim-fill" cx="44" cy="94" r="3" />
      <rect className="rm-line rm-panel" x="148" y="58" width="72" height="34" rx="8" />
      <path
        className="rm-gold"
        d="M158 75h6l3-8 4 16 4-12 3 8 4-14 4 18 3-10 3 4h12"
      />
    </>
  ),
  pilot: (
    <>
      <rect className="rm-line rm-panel" x="24" y="18" width="62" height="78" rx="6" />
      <path className="rm-text" d="M34 34h40M34 46h34M34 58h40M34 70h28" />
      <path className="rm-dim" d="M34 84h18" />
      <path className="rm-line" d="M86 56h30" strokeDasharray="3 4" />
      {[132, 164, 196].map((x) => (
        <g key={x} className="rm-line">
          <circle cx={x} cy="44" r="8" />
          <path d={`M${x - 13} 72c1.6-9 6.6-13 13-13s11.4 4 13 13`} />
        </g>
      ))}
      <path className="rm-dim" d="M120 90h92" />
    </>
  ),
  mainnet: (
    <>
      <circle className="rm-line" cx="70" cy="56" r="30" />
      <path className="rm-dim" d="M40 56h60M70 26c9 8 13 18 13 30s-4 22-13 30c-9-8-13-18-13-30s4-22 13-30Z" />
      <path className="rm-line" d="M108 56h34" strokeDasharray="3 4" />
      <Wallet x={150} y={36} />
      <path className="rm-text" d="M150 74h30" />
      <path className="rm-gold" d="M196 30v14m-7-7h14" />
    </>
  ),
  qr: (
    <>
      <rect className="rm-line rm-panel" x="34" y="16" width="80" height="80" rx="6" />
      <g className="rm-strong">
        <rect x="44" y="26" width="18" height="18" rx="2" />
        <rect x="86" y="26" width="18" height="18" rx="2" />
        <rect x="44" y="68" width="18" height="18" rx="2" />
        <path d="M70 26v8M70 40h8M78 50v8M86 52h10M70 62h8v8M88 66v8M96 74h8v12M78 80h4" />
      </g>
      <path className="rm-dim" d="M122 56h22" strokeDasharray="3 4" />
      <rect className="rm-line rm-panel" x="152" y="14" width="48" height="86" rx="8" />
      <path className="rm-dim" d="M170 21h12" />
      <path className="rm-text" d="M162 40h28M162 50h20" />
      <rect className="rm-gold" x="162" y="74" width="28" height="12" rx="4" />
    </>
  ),
  credential: (
    <>
      <rect className="rm-line rm-panel" x="28" y="22" width="104" height="68" rx="8" />
      <circle className="rm-line" cx="54" cy="50" r="11" />
      <path className="rm-text" d="M76 44h42M76 56h30M44 76h72" />
      <path className="rm-gold" d="M176 20 202 30v20c0 16-11 28-26 34-15-6-26-18-26-34V30Z" />
      <path className="rm-gold" d="m164 52 8 8 16-17" />
    </>
  ),
  checks: (
    <>
      {/* A water or sewer main along the road, a service line into the lot, and an easement band across it. */}
      <path className="rm-dim" d="M20 18h200M20 28h200" />
      <path className="rm-line" d="M20 23h200" strokeDasharray="12 5" />
      <path className="rm-line" d="M112 28v14" />
      <circle className="rm-line rm-panel" cx="112" cy="44" r="3.4" />
      <path className="rm-line rm-panel" d="M52 52 150 46 192 66 180 100 64 104Z" />
      <path className="rm-easement" d="M58 82 188 74" />
      <path className="rm-strong" d="M72 62h30" />
    </>
  ),
  nation: (
    <>
      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 11 }, (_, col) => {
          const x = 30 + col * 18;
          const y = 18 + row * 15;
          const ohio = row === 2 && col === 7;
          return (
            <rect
              key={`${row}-${col}`}
              className={ohio ? "rm-gold rm-gold-soft" : "rm-grid"}
              x={x}
              y={y}
              width="14"
              height="11"
              rx="2"
            />
          );
        }),
      )}
    </>
  ),
  deed: (
    <>
      <rect className="rm-line rm-panel" x="30" y="16" width="64" height="82" rx="5" />
      <path className="rm-text" d="M42 32h40M42 44h34M42 56h40M42 68h22" />
      <circle className="rm-green" cx="76" cy="84" r="6" />
      <path className="rm-line" d="M102 56h34" strokeDasharray="3 4" />
      <g className="rm-line">
        <path d="M146 44 178 26l32 18" />
        <path d="M150 48h56M154 52v30M168 52v30M188 52v30M202 52v30M146 88h64" />
      </g>
    </>
  ),
  identity: (
    <>
      <rect className="rm-line rm-panel" x="36" y="22" width="112" height="70" rx="8" />
      <circle className="rm-line" cx="68" cy="50" r="12" />
      <path className="rm-line" d="M50 82c3-9 9-13 18-13s15 4 18 13" />
      <path className="rm-text" d="M100 44h34M100 56h26M100 68h30" />
      <circle className="rm-gold" cx="184" cy="56" r="20" />
      <path className="rm-gold" d="m174 56 7 7 13-14" />
    </>
  ),
  milestone: (
    <>
      <path className="rm-line" d="M28 64h184" />
      <circle className="rm-green-fill" cx="48" cy="64" r="6" />
      <circle className="rm-gold rm-panel-dark" cx="120" cy="64" r="6" />
      <circle className="rm-dim rm-panel-dark" cx="192" cy="64" r="6" />
      <path className="rm-text" d="M34 86h28M106 86h28M178 86h28" />
      <circle className="rm-line" cx="120" cy="30" r="12" />
      <path className="rm-gold" d="M120 23v7l5 3" />
      <path className="rm-dim" d="M186 44c-20-20-110-20-138 8" strokeDasharray="3 4" />
      <path className="rm-dim" d="m54 46-6 6 8 2" />
    </>
  ),
  ask: (
    <>
      <rect className="rm-line rm-panel" x="104" y="12" width="108" height="26" rx="10" />
      <path className="rm-text" d="M116 25h72" />
      <rect className="rm-line rm-panel" x="28" y="48" width="138" height="52" rx="10" />
      <path className="rm-text" d="M40 62h110M40 74h86" />
      <rect className="rm-gold" x="40" y="84" width="24" height="10" rx="3" />
      <rect className="rm-gold" x="70" y="84" width="24" height="10" rx="3" />
    </>
  ),
  alert: (
    <>
      <path className="rm-line" d="M48 18h44v80L70 82 48 98Z" />
      <path className="rm-line" d="M140 76V54a20 20 0 0 1 40 0v22l6 6h-52Z" />
      <path className="rm-line" d="M153 90a8 8 0 0 0 14 0" />
      <circle className="rm-gold-fill rm-pulse" cx="180" cy="38" r="5" />
      <path className="rm-dim" d="M100 58h28" strokeDasharray="3 4" />
    </>
  ),
};

/** One card's small sketch, in a frame captioned "Illustration". */
export function RoadmapSketch({ name, caption }: { name: RoadmapIcon; caption: string }) {
  return (
    <div className="rm-art" aria-hidden="true">
      <svg viewBox="0 0 240 112" focusable="false">
        {ART[name]}
      </svg>
      <span className="rm-art-caption">{caption}</span>
    </div>
  );
}
