import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { LAND } from "../../content/parcel";
import type { LandAssets } from "./landAssets";
import { FlatLand } from "./FlatLand";

const MIN = 1;
const MAX = 3.2;
const STEP = 0.25;

/**
 * The flat aerial with light pan and zoom: wheel or pinch-like buttons, drag
 * to pan when zoomed in. Keeps the same frame as the 3D stage.
 */
export function FlatLandView({ assets, ring }: { assets: LandAssets; ring: number[][] }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const clampPan = (next: { x: number; y: number }, nextScale: number) => {
    const limit = ((nextScale - 1) / nextScale) * 50;
    return {
      x: Math.max(-limit, Math.min(limit, next.x)),
      y: Math.max(-limit, Math.min(limit, next.y)),
    };
  };

  const zoomBy = (delta: number) => {
    setScale((current) => {
      const next = Math.max(MIN, Math.min(MAX, current + delta));
      setPan((p) => clampPan(p, next));
      return next;
    });
  };

  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -STEP : STEP);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1 || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = ((event.clientX - start.x) / event.currentTarget.clientWidth) * 100;
    const dy = ((event.clientY - start.y) / event.currentTarget.clientHeight) * 100;
    setPan(clampPan({ x: start.panX + dx, y: start.panY + dy }, scale));
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="flat-view">
      <div
        className="flat-view-stage"
        style={{
          transform: `translate(${pan.x}%, ${pan.y}%) scale(${scale})`,
          cursor: scale > 1 ? "grab" : undefined,
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <FlatLand assets={assets} ring={ring} />
      </div>
      <div className="flat-zoom" role="group" aria-label={LAND.view.label}>
        <button type="button" onClick={() => zoomBy(STEP)} aria-label={LAND.view.zoomIn}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(-STEP)} aria-label={LAND.view.zoomOut}>
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label={LAND.view.reset}
        >
          1×
        </button>
      </div>
    </div>
  );
}
