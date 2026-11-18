// The land block's asset contract now lives in @groundtruth/shared (land.ts),
// shared by the bake script, the API's on-demand builder, and the web.
export {
  LAND_META_VERSION,
  isLandMeta,
  landAssetDir,
  mercatorLat,
  mercatorLng,
  mercatorX,
  mercatorY,
  outerRing,
  regionUV,
  type LandMeta,
} from "@groundtruth/shared";
