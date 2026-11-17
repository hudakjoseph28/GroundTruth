import type { Parcel } from "@groundtruth/shared";

export function ParcelBoundary({ geometry }: { geometry: Parcel["geometry"] }) {
  const ring = outerRing(geometry.geojson);
  const points = ring ? toPoints(ring) : "";

  return (
    <figure className="boundary">
      {points ? (
        <svg viewBox="0 0 100 100" role="img" aria-label="Parcel boundary">
          <polygon points={points} />
        </svg>
      ) : (
        <p>This parcel has no drawable boundary.</p>
      )}
      <figcaption>
        <span>Published parcel boundary. Not a survey.</span>
        <a href={geometry.sourceUrl}>{geometry.authority}</a>
        <span>Retrieved {calendarDate(geometry.retrievedAt)}</span>
      </figcaption>
    </figure>
  );
}

function outerRing(geojson: Parcel["geometry"]["geojson"]): number[][] | null {
  const ring =
    geojson.type === "Polygon"
      ? geojson.coordinates[0]
      : geojson.coordinates[0]?.[0];
  if (!ring || ring.length < 3) return null;
  return ring;
}

function toPoints(ring: number[][]): string {
  const lngs = ring.map((pair) => pair[0] ?? 0);
  const lats = ring.map((pair) => pair[1] ?? 0);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const width = maxLng - minLng || 0.001;
  const height = maxLat - minLat || 0.001;
  return ring
    .map((pair) => {
      const lng = pair[0] ?? minLng;
      const lat = pair[1] ?? minLat;
      const x = 12 + ((lng - minLng) / width) * 76;
      const y = 88 - ((lat - minLat) / height) * 76;
      return `${x},${y}`;
    })
    .join(" ");
}

function calendarDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
}
