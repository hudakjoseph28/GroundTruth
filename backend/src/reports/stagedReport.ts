import {
  CHECK_KINDS,
  stagedParcel,
  type CheckKind,
  type ParcelReport,
} from "@groundtruth/shared";

/**
 * The shared fixture has a parcel and no report.
 * Every check stays unknown. `biggestOpenQuestion` is the first documented
 * kind because ParcelReport requires one and the fixture does not rank a question.
 * Gagan replaces this when a verified report exists.
 */
export const stagedBiggestOpenQuestion: CheckKind = CHECK_KINDS[0];

export const stagedReport: ParcelReport = {
  parcelKey: stagedParcel.key,
  generatedAt: stagedParcel.geometry.retrievedAt,
  coverage: "boundaryOnly",
  biggestOpenQuestion: stagedBiggestOpenQuestion,
  checks: CHECK_KINDS.map((kind) => ({
    kind,
    status: "unknown",
    finding: "The staged fixture does not include evidence for this check.",
    limitation: "No land-use conclusion is established.",
    sources: [],
    responsibleParty: { role: "Unassigned" },
    nextAction: "No next action is recorded in the staged fixture.",
  })),
};
