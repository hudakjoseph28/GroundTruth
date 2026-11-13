// One palette for every globe layer.
// Meaning: green = settled, red = held, gold = the parcel being viewed (Ohio).
export const PALETTE = {
  surface: "#040404",
  rim: "#6f6f6f",
  green: "#3FA86A",
  red: "#D64545",
  gold: "#D9AE5F",
} as const;

export type RGB = [number, number, number];

/** #rrggbb to 0..1 floats, for vertex colors. */
export function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
