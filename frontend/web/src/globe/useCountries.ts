import { useEffect, useState } from "react";

export interface CountryFeature {
  type: "Feature";
  properties: { ADMIN?: string; NAME?: string };
  geometry: object;
}

// One fetch per page load, shared by the static fallback and the WebGL globe.
let loaded: CountryFeature[] | null = null;
let pending: Promise<CountryFeature[]> | null = null;

function loadCountries(): Promise<CountryFeature[]> {
  pending ??= fetch("/data/countries.geojson")
    .then((response) => response.json())
    .then((data: { features: CountryFeature[] }) => (loaded = data.features))
    .catch(() => {
      pending = null;
      return [];
    });
  return pending;
}

/** Country shapes (Natural Earth 1:110m, public domain), served from /public/data. */
export function useCountries(): CountryFeature[] {
  const [countries, setCountries] = useState<CountryFeature[]>(() => loaded ?? []);
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void loadCountries().then((features) => {
      if (!cancelled && features.length) setCountries(features);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return countries;
}
