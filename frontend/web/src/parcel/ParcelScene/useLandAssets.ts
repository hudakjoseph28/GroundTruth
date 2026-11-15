import { useEffect, useState } from "react";
import { loadLandAssets, type LandAssets } from "./landAssets";

/** undefined while loading, null when the parcel has no baked assets. */
export function useLandAssets(sourceParcelId: string): LandAssets | null | undefined {
  const [loaded, setLoaded] = useState<{ id: string; assets: LandAssets | null }>();

  useEffect(() => {
    let current = true;
    void loadLandAssets(sourceParcelId).then((assets) => {
      if (current) setLoaded({ id: sourceParcelId, assets });
    });
    return () => {
      current = false;
    };
  }, [sourceParcelId]);

  return loaded?.id === sourceParcelId ? loaded.assets : undefined;
}
