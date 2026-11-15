import { useId } from "react";
import { LAND } from "../../content/parcel";
import type { LandAssets } from "./landAssets";
import { regionUV } from "./landMeta";

/**
 * The baked imagery as a flat picture: dim outside the parcel, clear inside,
 * boundary in gold. Used when motion is reduced or WebGL is unavailable.
 */
export function FlatLand({ assets, ring }: { assets: LandAssets; ring: number[][] }) {
  const clip = useId();
  const points = ring
    .map((pair) => {
      const { u, v } = regionUV(assets.meta.bbox, pair[0] ?? 0, pair[1] ?? 0);
      return `${(u * 100).toFixed(2)},${(v * 100).toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      className="land-flat"
      data-land="flat"
      viewBox="0 0 100 100"
      role="img"
      aria-label={LAND.labelFlat}
    >
      <defs>
        <clipPath id={clip}>
          <polygon points={points} />
        </clipPath>
      </defs>
      <image href={assets.imageryUrl} width="100" height="100" opacity="0.42" />
      <image href={assets.imageryUrl} width="100" height="100" clipPath={`url(#${clip})`} />
      <polygon className="land-flat-outline" points={points} />
    </svg>
  );
}
