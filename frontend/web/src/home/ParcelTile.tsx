import { useMemo } from "react";
import { goldenParcel } from "@groundtruth/shared";
import { HOW, type CalloutId } from "../content/home";
import { FlatLand } from "../parcel/ParcelScene/FlatLand";
import { heightAt } from "../parcel/ParcelScene/landAssets";
import { outerRing, regionUV } from "../parcel/ParcelScene/landMeta";
import { useLandAssets } from "../parcel/ParcelScene/useLandAssets";

const SAMPLES = 72;
/** Thin sheets stacked under the picture: seen at a tilt, they read as the slab's soil. */
const SOIL = Array.from({ length: 14 }, (_, index) => 14 - index);
const P = HOW.parcel;

/**
 * The demo parcel's baked aerial as a tilted tile, over a profile of its real
 * elevation. `focus` says which callout is lit; the line under the picture
 * names that layer's source. The hero already runs the 3D block, so this one
 * is the flat picture and costs no WebGL.
 */
export function ParcelTile({ focus }: { focus: CalloutId | null }) {
  const { assets } = useLandAssets(goldenParcel);
  const ring = useMemo(() => outerRing(goldenParcel.geometry.geojson), []);

  // Heights along the row through the parcel's middle, west to east.
  const profile = useMemo(() => {
    if (!assets) return null;
    const { v } = regionUV(assets.meta.bbox, goldenParcel.centroid.longitude, goldenParcel.centroid.latitude);
    const row = Math.min(1, Math.max(0, v));
    const points = Array.from({ length: SAMPLES + 1 }, (_, index) => {
      const u = index / SAMPLES;
      return `${(u * 100).toFixed(2)},${(22 - heightAt(assets, u, row) * 18).toFixed(2)}`;
    });
    return { line: points.join(" "), row };
  }, [assets]);

  if (!assets || ring.length < 3) return <div className="tile" data-empty />;
  const { imagery, elevation } = assets.meta;
  const label =
    focus === "elevation"
      ? P.labels.elevation(elevation.attribution, Math.round(elevation.minMeters), Math.round(elevation.maxMeters))
      : focus === "boundary"
        ? P.labels.boundary
        : imagery.attribution;

  return (
    <div className="tile" data-focus={focus ?? undefined}>
      <div className="tile-space">
        <div className="tile-plane" style={{ "--row": profile?.row ?? 0.5 } as Record<`--${string}`, number>}>
          {SOIL.map((layer) => (
            <i key={layer} className="tile-soil" style={{ "--layer": layer } as Record<`--${string}`, number>} />
          ))}
          <FlatLand assets={assets} ring={ring} />
          <i className="tile-scan" />
        </div>
      </div>
      {profile && (
        <div className="tile-profile">
          <span>{P.profile}</span>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none">
            <polyline points={profile.line} />
          </svg>
        </div>
      )}
      <p className="tile-label">{label}</p>
    </div>
  );
}
