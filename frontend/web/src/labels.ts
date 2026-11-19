import {
  CHECK_KINDS,
  type CheckKind,
  type CheckStatus,
} from "@groundtruth/shared";

export const CHECK_LABELS: Record<CheckKind, string> = {
  zoning: "Zoning",
  flood: "Flood",
  environmental: "Wetlands & streams",
  access: "Road access",
  utilities: "Utilities",
  easements: "Easements",
  sellerAuthority: "Seller authority",
  survey: "Survey",
  septic: "Septic",
  closing: "Closing",
};

export const STATUS_LABELS: Record<CheckStatus, string> = {
  evidenceFound: "Evidence found",
  needsReview: "Needs review",
  unknown: "No answer yet",
  signedOff: "Signed off",
  held: "Held",
};

export const DOCUMENTED_CHECKS: readonly CheckKind[] = CHECK_KINDS;
