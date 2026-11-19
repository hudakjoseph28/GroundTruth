import { isParcelLayers, type ParcelLayers } from "@groundtruth/shared";
import { request, type FailedOutcome } from "./api";

export type LayersOutcome =
  | { status: "found"; layers: ParcelLayers }
  | FailedOutcome;

/**
 * GET /api/parcels/:parcelKey/layers: the map layers for the land block.
 * Never throws, except when the caller aborts.
 */
export async function getParcelLayers(
  parcelKey: string,
  signal?: AbortSignal,
): Promise<LayersOutcome> {
  const response = await request(
    `/api/parcels/${encodeURIComponent(parcelKey)}/layers`,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return {
      status: "error",
      message: response.error.error.message,
      retryable: false,
    };
  }
  if (!isParcelLayers(response.body)) {
    return {
      status: "error",
      message: "The map layers came back unreadable.",
      retryable: true,
    };
  }
  return { status: "found", layers: response.body };
}
