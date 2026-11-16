import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useRenderMode, type RenderMode } from "../parcel/useRenderMode";
import type { GlobeBudget } from "./NetworkGlobe";
import { StaticGlobe } from "./StaticGlobe";

const NetworkGlobe = lazy(() =>
  import("./NetworkGlobe").then((module) => ({ default: module.NetworkGlobe })),
);

/** The page's text, search and land block get this long to themselves first. */
const ARM_MS = 1500;

/**
 * The network globe as a backdrop: nothing in it can be grabbed. It starts as
 * a still drawing and becomes the moving WebGL globe once the page has
 * settled. With motion reduced or no WebGL it stays still.
 *
 * Parked: no page renders it at present. The hero is the land alone; the
 * globe comes back when a section has something true for it to show. Whoever
 * places it sizes and positions `.webgl-globe` and `.static-globe` themselves.
 */
export function GlobeSlot({ budget = "full" }: { budget?: GlobeBudget }) {
  const mode = useRenderMode();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), ARM_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const still = <StaticGlobe reason={staticReason(mode)} />;
  return (
    <div className="globe-slot">
      {mode === "webgl" && armed ? (
        <GlobeBoundary fallback={<StaticGlobe reason="WebGL could not start, so the globe stays still." />}>
          <Suspense fallback={still}>
            <NetworkGlobe budget={budget} />
          </Suspense>
        </GlobeBoundary>
      ) : (
        still
      )}
    </div>
  );
}

function staticReason(mode: RenderMode): string {
  if (mode === "reduced") return "Motion is reduced, so the globe stays still.";
  if (mode === "fallback") return "WebGL is unavailable, so the globe stays still.";
  return "The network view is loading.";
}

class GlobeBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
