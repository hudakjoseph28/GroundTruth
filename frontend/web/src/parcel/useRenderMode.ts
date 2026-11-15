import { useEffect, useState } from "react";

/**
 * How much the page may draw: "webgl" for the full scenes, "reduced" when the
 * visitor asked for less motion, "fallback" when WebGL is unavailable.
 * "pending" lasts one render, before the browser has been asked.
 */
export type RenderMode = "pending" | "webgl" | "reduced" | "fallback";

export function useRenderMode(): RenderMode {
  const [mode, setMode] = useState<RenderMode>("pending");

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (motion.matches) setMode("reduced");
      else setMode(hasWebGL() ? "webgl" : "fallback");
    };
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  return mode;
}

let webgl: boolean | null = null;

function hasWebGL(): boolean {
  if (webgl === null) {
    try {
      const canvas = document.createElement("canvas");
      webgl = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
