import type { CSSProperties } from "react";
import {
  MAP_LAYER_IDS,
  type MapLayer,
  type ParcelLayers,
} from "@groundtruth/shared";
import { LAYERS, layerStatus, type LayerToggleId } from "../../content/layers";
import { LAYER_COLORS } from "./paintLayers";

export const LAYER_TOGGLES: readonly LayerToggleId[] = [
  "boundary",
  ...MAP_LAYER_IDS,
];

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Toggles for what is drawn on the land, and a legend for each one that is
 * on: its colour, what its source says here, and where and when it came from.
 */
export function LayerPanel({
  layers,
  enabled,
  onToggle,
  onRetry,
}: {
  /** undefined while loading, null when they could not be loaded. */
  layers: ParcelLayers | null | undefined;
  enabled: ReadonlySet<LayerToggleId>;
  onToggle: (id: LayerToggleId) => void;
  onRetry: () => void;
}) {
  const shown = LAYER_TOGGLES.filter((id) => enabled.has(id));
  const layerOf = (id: LayerToggleId): MapLayer | undefined =>
    id === "boundary"
      ? undefined
      : layers?.layers.find((layer) => layer.id === id);

  return (
    <div className="layer-panel">
      <div className="layer-toggles" role="group" aria-label={LAYERS.label}>
        {LAYER_TOGGLES.map((id) => (
          <button
            key={id}
            type="button"
            className="layer-toggle"
            data-layer={id}
            aria-pressed={enabled.has(id)}
            onClick={() => onToggle(id)}
            style={{ "--layer": LAYER_COLORS[id] } as CSSProperties}
          >
            <span className="layer-swatch" aria-hidden="true" />
            {LAYERS.names[id]}
          </button>
        ))}
      </div>
      {shown.length > 0 && (
        <ul
          className="layer-legend"
          aria-label={LAYERS.legend}
          aria-live="polite"
        >
          {shown.map((id) => {
            const layer = layerOf(id);
            const status =
              id === "boundary"
                ? LAYERS.boundary
                : layers === undefined
                  ? LAYERS.loading
                  : layers === null
                    ? LAYERS.failed
                    : layer
                      ? layerStatus(layer)
                      : LAYERS.unavailable;
            return (
              <li
                key={id}
                data-layer={id}
                data-status={layer?.status}
                style={{ "--layer": LAYER_COLORS[id] } as CSSProperties}
              >
                <span
                  className="layer-swatch"
                  data-kind={id}
                  aria-hidden="true"
                />
                <div>
                  <p>
                    <strong>{LAYERS.names[id]}</strong> {status}
                  </p>
                  {id === "flood" &&
                    layer?.shapes.some((shape) => shape.tone === "light") && (
                      <p className="layer-note">{LAYERS.floodLight}</p>
                    )}
                  {id !== "boundary" &&
                    (layers === null || layer?.status === "unavailable") && (
                      <button
                        type="button"
                        className="layer-retry"
                        onClick={onRetry}
                      >
                        {LAYERS.retry}
                      </button>
                    )}
                  {layer?.source && (
                    <p className="layer-note">
                      <a
                        href={layer.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {LAYERS.sourceLine(
                          layer.source.authority,
                          date(layer.source.retrievedAt),
                        )}
                      </a>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
