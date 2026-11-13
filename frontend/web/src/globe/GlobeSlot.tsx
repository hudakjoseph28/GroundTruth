import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { StaticGlobe } from "./StaticGlobe";

const NetworkGlobe = lazy(() =>
  import("./NetworkGlobe").then((module) => ({ default: module.NetworkGlobe })),
);

export function GlobeSlot() {
  const mode = useGlobeMode();
  return (
    <div className="globe-slot">
      {mode === "webgl" ? (
        <GlobeBoundary>
          <Suspense
            fallback={<StaticGlobe reason="The network view is loading." />}
          >
            <NetworkGlobe />
          </Suspense>
        </GlobeBoundary>
      ) : (
        <StaticGlobe reason={staticReason(mode)} />
      )}
      <p className="globe-caption">
        Illustrative activity, not live transactions.
        {mode === "reduced" || mode === "fallback" ? ` ${staticReason(mode)}` : ""}
      </p>
    </div>
  );
}

function staticReason(
  mode: "pending" | "webgl" | "reduced" | "fallback",
): string {
  if (mode === "reduced") return "Motion is reduced, so the globe stays still.";
  if (mode === "fallback")
    return "WebGL is unavailable, so the globe stays still.";
  return "The network view is loading.";
}

function useGlobeMode(): "pending" | "webgl" | "reduced" | "fallback" {
  const [mode, setMode] = useState<
    "pending" | "webgl" | "reduced" | "fallback"
  >("pending");

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (motion.matches) {
        setMode("reduced");
        return;
      }
      setMode(hasWebGL() ? "webgl" : "fallback");
    };
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  return mode;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class GlobeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <StaticGlobe reason="WebGL could not start, so the globe stays still." />
      );
    }
    return this.props.children;
  }
}
