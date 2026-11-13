export interface City {
  name: string;
  lat: number;
  lng: number;
}

// Ohio is the hub: it's where GroundTruth's parcel coverage starts.
export const HUB: City = { name: "Columbus, Ohio", lat: 39.96, lng: -82.99 };

export const CITIES: City[] = [
  HUB,
  { name: "Cleveland, Ohio", lat: 41.5, lng: -81.69 },
  { name: "Cincinnati, Ohio", lat: 39.1, lng: -84.51 },
  { name: "New York", lat: 40.71, lng: -74.01 },
  { name: "Austin", lat: 30.27, lng: -97.74 },
  { name: "San Francisco", lat: 37.77, lng: -122.42 },
  { name: "Chicago", lat: 41.88, lng: -87.63 },
  { name: "Miami", lat: 25.76, lng: -80.19 },
  { name: "Toronto", lat: 43.65, lng: -79.38 },
  { name: "Mexico City", lat: 19.43, lng: -99.13 },
  { name: "São Paulo", lat: -23.55, lng: -46.63 },
  { name: "Buenos Aires", lat: -34.6, lng: -58.38 },
  { name: "Bogotá", lat: 4.71, lng: -74.07 },
  { name: "London", lat: 51.51, lng: -0.13 },
  { name: "Paris", lat: 48.86, lng: 2.35 },
  { name: "Berlin", lat: 52.52, lng: 13.4 },
  { name: "Zurich", lat: 47.38, lng: 8.54 },
  { name: "Lisbon", lat: 38.72, lng: -9.14 },
  { name: "Lagos", lat: 6.52, lng: 3.38 },
  { name: "Nairobi", lat: -1.29, lng: 36.82 },
  { name: "Cape Town", lat: -33.92, lng: 18.42 },
  { name: "Dubai", lat: 25.2, lng: 55.27 },
  { name: "Mumbai", lat: 19.08, lng: 72.88 },
  { name: "Singapore", lat: 1.35, lng: 103.82 },
  { name: "Hong Kong", lat: 22.32, lng: 114.17 },
  { name: "Seoul", lat: 37.57, lng: 126.98 },
  { name: "Tokyo", lat: 35.68, lng: 139.69 },
  { name: "Sydney", lat: -33.87, lng: 151.21 },
  { name: "Auckland", lat: -36.85, lng: 174.76 },
];
