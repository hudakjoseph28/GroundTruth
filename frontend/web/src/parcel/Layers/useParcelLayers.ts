import { useCallback, useEffect, useState } from "react";
import type { ParcelLayers } from "@groundtruth/shared";
import { getParcelLayers } from "../../data/layerSource";

export interface ParcelLayersState {
  /** undefined while loading, null when the layers could not be had. */
  layers: ParcelLayers | null | undefined;
  /** NWI's drawing of the view, decoded, when the wetlands layer has one. */
  wetlandsImage: HTMLImageElement | null;
  /** Asks again (the API keeps no answer with a failed layer). */
  retry: () => void;
}

async function decode(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** The parcel's map layers, asked for once the land view can draw them. */
export function useParcelLayers(
  parcelKey: string,
  enabled: boolean,
): ParcelLayersState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    attempt: number;
    layers: ParcelLayers | null;
    wetlandsImage: HTMLImageElement | null;
  }>();
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getParcelLayers(parcelKey, controller.signal)
      .then(async (outcome) => {
        if (outcome.status !== "found") {
          setLoaded({
            key: parcelKey,
            attempt,
            layers: null,
            wetlandsImage: null,
          });
          return;
        }
        const image = outcome.layers.layers.find(
          (layer) => layer.id === "wetlands",
        )?.image;
        const wetlandsImage = image ? await decode(image) : null;
        if (!controller.signal.aborted) {
          setLoaded({
            key: parcelKey,
            attempt,
            layers: outcome.layers,
            wetlandsImage,
          });
        }
      })
      .catch(() => {
        /* aborted: the parcel changed or the page left */
      });
    return () => controller.abort();
  }, [parcelKey, enabled, attempt]);

  if (loaded?.key !== parcelKey || loaded.attempt !== attempt) {
    return { layers: undefined, wetlandsImage: null, retry };
  }
  return { layers: loaded.layers, wetlandsImage: loaded.wetlandsImage, retry };
}
