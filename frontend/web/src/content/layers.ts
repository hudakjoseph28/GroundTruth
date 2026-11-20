import type { MapLayer, MapLayerId } from "@groundtruth/shared";

export type TerrainLayerId = "elevation" | "slope";
/** A toggle on the land view: the boundary, the Buildable area estimate, terrain, or one of the API's map layers. */
export type LayerToggleId =
  | "boundary"
  | "buildableArea"
  | TerrainLayerId
  | MapLayerId;

// Words for the map layers on the land view. Each status line says only what
// the layer's source answered; "unavailable" never reads as "none".
export const LAYERS = {
  label: "Map layers",
  legend: "Legend",
  showAll: "Show all layers",
  hideAll: "Boundary only",
  loading: "Loading…",
  failed:
    "The map layers could not be loaded. The report's checks below still hold.",
  names: {
    boundary: "Parcel boundary",
    buildableArea: "Buildable area",
    elevation: "Elevation",
    slope: "Slope",
    flood: "FEMA flood zones",
    streamSetback: "Stream setback",
    wetlands: "Wetlands",
    zoning: "Zoning districts",
    roadRightOfWay: "Road right-of-way",
  } satisfies Record<LayerToggleId, string>,
  elevation: (contourFeet: number) =>
    `Colored by height, with contour lines every ${contourFeet} ft.`,
  elevationScale: "Elevation color scale in feet",
  slope: (steepShare: number | null) =>
    steepShare === null
      ? "Areas steeper than 15% are shaded red."
      : steepShare === 0
        ? "No part of the lot reads steeper than 15% in the map elevation."
        : `Shaded red: about ${Math.max(1, Math.round(steepShare * 100))}% of the lot is steeper than 15%.`,
  boundary: "The lot's published OGRIP boundary.",
  floodLight: "Lighter: 0.2% annual chance",
  notCovered: {
    flood: "FEMA has no flood study for this county.",
    streamSetback: "Franklin County's setback map only.",
    wetlands:
      "No National Wetlands Inventory mapping here, so no wetland can be ruled out.",
    zoning: "Franklin County's zoning map only.",
    roadRightOfWay: "Franklin County's right-of-way map only.",
  } satisfies Record<MapLayerId, string>,
  unavailable:
    "The source did not answer, so nothing is concluded here. Try again later.",
  retry: "Try again",
  sourceLine: (authority: string, date: string) => `${authority}, ${date}`,
} as const;

/** `4.7%`, `41%`, `99.6%`: one decimal under 10% and from 99%, as the report writes them. */
export function percent(share: number): string {
  const value = share * 100;
  const rounded =
    value >= 99 || value < 10 ? value.toFixed(1) : value.toFixed(0);
  return `${rounded.replace(/\.0$/, "")}%`;
}

function about(share: number): string {
  if (share >= 0.9995) return "all of it";
  if (share < 0.001) return "less than 0.1%";
  return `about ${percent(share)}`;
}

function list(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** What the legend says about one layer from the API. */
export function layerStatus(layer: MapLayer): string {
  if (layer.status === "notCovered") return LAYERS.notCovered[layer.id];
  if (layer.status === "unavailable") return LAYERS.unavailable;
  const onLot = layer.onLot ?? [];
  switch (layer.id) {
    case "flood": {
      if (layer.status === "none") {
        return layer.inView.length > 0
          ? `Only ${list(layer.inView)} in view, so nothing is shaded.`
          : "FEMA maps no flood zone in view.";
      }
      const lot =
        onLot.length > 0
          ? `On the lot: ${list(onLot.map((zone) => `${zone.name} on ${about(zone.share)}`))}.`
          : "None of the shaded zones reaches the lot.";
      return `In view: ${list(layer.inView)}. ${lot}`;
    }
    case "streamSetback": {
      if (layer.status === "none")
        return "Franklin County maps no stream setback in view.";
      if (onLot.length === 0)
        return `${list(layer.inView)} in view, not on the lot.`;
      return (
        list(
          onLot.map((area) =>
            area.share >= 0.9995
              ? `All of the lot is inside the ${area.name}`
              : `${capitalize(about(area.share))} of the lot is inside the ${area.name}`,
          ),
        ) + "."
      );
    }
    case "wetlands":
      return layer.status === "none"
        ? "NWI maps no wetland or water in view. That is not a wetland delineation."
        : `NWI maps ${list(layer.inView.map((type) => type.toLowerCase()))} in view. Outlines are approximate, not a delineation.`;
    case "zoning": {
      if (layer.status === "none") {
        return "No county zoning district in view; a city or township may zone here.";
      }
      const lot =
        onLot.length > 0
          ? ` The lot: ${list(onLot.map((district) => `${district.name} on ${about(district.share)}`))}.`
          : " The lot is outside the county's zoned districts.";
      return `District lines in view: ${list(layer.inView)}.${lot}`;
    }
    case "roadRightOfWay": {
      if (layer.status === "none")
        return "No public road right-of-way is mapped in view.";
      const kind = list(layer.inView);
      return layer.distanceM === 0
        ? `Touches the lot (${kind}).`
        : `The nearest is about ${Math.round(layer.distanceM ?? 0)} m from the lot and does not touch it (${kind}).`;
    }
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
