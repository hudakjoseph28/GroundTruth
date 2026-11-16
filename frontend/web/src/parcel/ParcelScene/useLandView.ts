import { useCallback, useEffect, useState } from "react";
import type { RenderMode } from "../useRenderMode";

export type LandView = "3d" | "2d";

const KEY = "groundtruth.landView";

function readStored(): LandView | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "3d" || value === "2d" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(view: LandView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* private mode: preference is session-only */
  }
}

/**
 * The visitor's 3D / 2D choice for the land block. Defaults to 3D, or to 2D
 * when motion is reduced or WebGL is unavailable. The choice is remembered.
 */
export function useLandView(mode: RenderMode): {
  view: LandView;
  setView: (view: LandView) => void;
  threeDisabled: boolean;
  threeHint?: string;
} {
  const threeDisabled = mode === "reduced" || mode === "fallback";
  const threeHint =
    mode === "reduced"
      ? "3D is off while motion is reduced."
      : mode === "fallback"
        ? "3D needs WebGL, which this browser does not provide."
        : undefined;

  const [view, setViewState] = useState<LandView>(() => {
    if (threeDisabled) return "2d";
    return readStored() ?? "3d";
  });

  useEffect(() => {
    if (threeDisabled && view !== "2d") setViewState("2d");
  }, [threeDisabled, view]);

  const setView = useCallback(
    (next: LandView) => {
      if (next === "3d" && threeDisabled) return;
      setViewState(next);
      writeStored(next);
    },
    [threeDisabled],
  );

  return { view, setView, threeDisabled, threeHint };
}
