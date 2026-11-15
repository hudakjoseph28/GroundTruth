// The small part of Google's Maps JavaScript API that the 3D area view uses
// (the `maps3d` library: gmp-map-3d and a ground polyline), and a loader that
// fetches it only when asked. Nothing here runs without a key.

export interface LatLngAltitude {
  lat: number;
  lng: number;
  altitude: number;
}

export interface Camera3D {
  center: LatLngAltitude;
  /** Distance from the camera to the center, in meters. */
  range: number;
  /** Degrees from straight down. */
  tilt: number;
  heading: number;
}

export interface Map3D extends HTMLElement {
  flyCameraTo(options: { endCamera: Camera3D; durationMillis: number }): void;
  flyCameraAround(options: { camera: Camera3D; durationMillis: number; rounds: number }): void;
  stopCameraAnimation(): void;
}

export interface Maps3dLibrary {
  Map3DElement: new (options: Camera3D & { mode: string; description?: string }) => Map3D;
  Polyline3DElement: new (options: {
    path: LatLngAltitude[];
    altitudeMode: string;
    strokeColor: string;
    strokeWidth: number;
    outerColor?: string;
    outerWidth?: number;
    drawsOccludedSegments?: boolean;
  }) => HTMLElement;
}

interface GoogleMaps {
  importLibrary(name: "maps3d"): Promise<Maps3dLibrary>;
}

declare global {
  interface Window {
    google?: { maps?: GoogleMaps };
    __groundtruthMapsReady?: () => void;
  }
}

let loading: Promise<Maps3dLibrary> | null = null;
/** Loads Google's script (once) and resolves with the 3D maps library. */
export function loadMaps3d(apiKey: string): Promise<Maps3dLibrary> {
  loading ??= new Promise<GoogleMaps>((resolve, reject) => {
    window.__groundtruthMapsReady = () => {
      const maps = window.google?.maps;
      if (maps) resolve(maps);
      else reject(new Error("Google Maps did not initialize"));
    };
    const script = document.createElement("script");
    const query = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      libraries: "maps3d",
      callback: "__groundtruthMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${query.toString()}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.append(script);
  })
    .then((maps) => maps.importLibrary("maps3d"))
    .catch((error: unknown) => {
      // Let a later attempt try again.
      loading = null;
      throw error;
    });
  return loading;
}
