import type { Parcel } from "@groundtruth/shared";

type Centroid = Parcel["centroid"];

const at = ({ latitude, longitude }: Centroid) => `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

/** Google Maps, satellite layer, centered on the parcel. No key needed. */
export function googleMapsSatelliteUrl(centroid: Centroid): string {
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${at(centroid)}&zoom=18&basemap=satellite`;
}

/** Google Earth on the web, tilted toward the parcel. No key needed. */
export function googleEarthUrl(centroid: Centroid): string {
  return `https://earth.google.com/web/@${at(centroid)},300a,800d,35y,0h,60t,0r`;
}
