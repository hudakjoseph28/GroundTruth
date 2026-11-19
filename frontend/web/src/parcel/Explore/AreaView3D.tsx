import { useEffect, useRef, useState } from "react";
import type { Parcel } from "@groundtruth/shared";
import { AREA_VIEW, EXPLORE, PARCEL_PAGE } from "../../content/parcel";
import { parcelName } from "../../data/address";
import { loadMaps3d, type Camera3D, type Map3D } from "./googleMaps";
import { googleEarthUrl, googleMapsSatelliteUrl } from "./links";
import "./area.css";

/** Where the flight starts: high above Ohio, looking straight down. */
const OHIO: Camera3D = {
  center: { lat: 40.3, lng: -82.8, altitude: 0 },
  range: 900_000,
  tilt: 0,
  heading: 0,
};
const FLIGHT_MS = 6000;
/** One slow turn around the parcel. */
const ORBIT_MS = 90_000;
const GOLD = "#D9AE5F";

/**
 * Google's Photorealistic 3D imagery around the parcel, full screen. Only
 * ever rendered when a Maps key is configured, and only loaded on request.
 * Google draws its own logo and attribution inside the map; nothing here
 * covers them.
 */
export default function AreaView3D({
  apiKey,
  parcel,
  ring,
  staged,
  animate,
  onClose,
}: {
  apiKey: string;
  parcel: Parcel;
  /** The parcel's outer ring, as [longitude, latitude] pairs. */
  ring: number[][];
  staged: boolean;
  /** False when the visitor asked for reduced motion: no flight, no orbit. */
  animate: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  // A modal dialog: focus stays inside and Esc closes it.
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    let current = true;
    let map: Map3D | null = null;

    const { latitude, longitude } = parcel.centroid;
    // Far enough back to see the whole parcel and some of what surrounds it.
    const span = Math.max(
      ...ring.map((pair) =>
        Math.hypot(
          ((pair[0] ?? longitude) - longitude) * 111_320 * Math.cos((latitude * Math.PI) / 180),
          ((pair[1] ?? latitude) - latitude) * 110_540,
        ),
      ),
      60,
    );
    const end: Camera3D = {
      center: { lat: latitude, lng: longitude, altitude: 0 },
      range: Math.min(4000, Math.max(450, span * 5)),
      tilt: 60,
      heading: 0,
    };

    void loadMaps3d(apiKey)
      .then(({ Map3DElement, Polyline3DElement }) => {
        if (!current) return;
        map = new Map3DElement({
          ...(animate ? OHIO : end),
          mode: "SATELLITE",
          description: AREA_VIEW.mapLabel,
        });
        if (ring.length >= 4) {
          map.append(
            new Polyline3DElement({
              path: ring.map((pair) => ({ lat: pair[1] ?? latitude, lng: pair[0] ?? longitude, altitude: 0 })),
              altitudeMode: "CLAMP_TO_GROUND",
              strokeColor: GOLD,
              strokeWidth: 4,
              outerColor: "#1a1408",
              outerWidth: 0.35,
              drawsOccludedSegments: true,
            }),
          );
        }
        node.append(map);
        setState("ready");
        if (animate) {
          const flown = map;
          flown.addEventListener(
            "gmp-animationend",
            () => flown.flyCameraAround({ camera: end, durationMillis: ORBIT_MS, rounds: 1 }),
            { once: true },
          );
          flown.flyCameraTo({ endCamera: end, durationMillis: FLIGHT_MS });
        }
      })
      .catch(() => {
        if (current) setState("failed");
      });

    return () => {
      current = false;
      map?.stopCameraAnimation();
      map?.remove();
    };
  }, [apiKey, parcel, ring, animate]);

  return (
    <dialog ref={dialog} className="area" aria-labelledby="area-title" onClose={onClose}>
      <header className="area-head">
        <div>
          <h2 id="area-title">{AREA_VIEW.title}</h2>
          <p>
            {AREA_VIEW.around(
              parcelName(parcel.siteAddress).street ??
                PARCEL_PAGE.title(parcel.sourceParcelId),
            )}
            .{" "}
            {ring.length >= 4 && (staged ? AREA_VIEW.stagedBoundary : AREA_VIEW.boundary)}
          </p>
        </div>
        {/* Always here: if Google rejects the key it shows its own notice in
            the map, and these still lead to the same place. */}
        <p className="area-links">
          {[
            { title: EXPLORE.maps.title, href: googleMapsSatelliteUrl(parcel.centroid) },
            { title: EXPLORE.earth.title, href: googleEarthUrl(parcel.centroid) },
          ].map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.title} <span aria-hidden="true">↗</span>
              <span className="visually-hidden">({EXPLORE.newTab})</span>
            </a>
          ))}
        </p>
        <button type="button" className="area-close" onClick={onClose} autoFocus>
          {AREA_VIEW.close}
        </button>
      </header>
      <div ref={holder} className="area-map" data-state={state}>
        {state !== "ready" && (
          <p className="area-status" role="status">
            {state === "loading" ? AREA_VIEW.loading : AREA_VIEW.failed}
          </p>
        )}
      </div>
    </dialog>
  );
}
