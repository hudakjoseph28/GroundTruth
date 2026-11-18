import { useEffect, useState } from "react";
import type { Parcel } from "@groundtruth/shared";
import { loadLandAssets, type LandAssets } from "./landAssets";

export interface LandAssetsState {
  /** undefined while loading, null when none could be had (baked or built). */
  assets: LandAssets | null | undefined;
  /** The parcel is not baked, so the API is building its land block. */
  building: boolean;
}

export function useLandAssets(
  parcel: Pick<Parcel, "key" | "sourceParcelId">,
): LandAssetsState {
  const { key, sourceParcelId } = parcel;
  const [loaded, setLoaded] = useState<{ key: string; assets: LandAssets | null }>();
  const [buildingKey, setBuildingKey] = useState<string>();

  useEffect(() => {
    let current = true;
    void loadLandAssets({ key, sourceParcelId }, (phase) => {
      if (current && phase === "building") setBuildingKey(key);
    }).then((assets) => {
      if (current) setLoaded({ key, assets });
    });
    return () => {
      current = false;
    };
  }, [key, sourceParcelId]);

  const assets = loaded?.key === key ? loaded.assets : undefined;
  return { assets, building: assets === undefined && buildingKey === key };
}
