import type { ComponentType } from "react";
import type { WalkStepId } from "../content/walkthrough";
import {
  CallScene,
  FindScene,
  FundScene,
  HeldScene,
  LandScene,
  ReceiptsScene,
  ReleaseScene,
  ReportScene,
  SepticScene,
  SurveyScene,
  TitleScene,
  ZoningScene,
} from "./scenes";

export interface WalkStep {
  id: WalkStepId;
  Scene: ComponentType;
  /** The "what if" after the story ends. */
  bonus?: boolean;
}

/** The example closing, in order, then the bonus. */
export const WALK_STEPS: readonly WalkStep[] = [
  { id: "find", Scene: FindScene },
  { id: "land", Scene: LandScene },
  { id: "report", Scene: ReportScene },
  { id: "fund", Scene: FundScene },
  { id: "call", Scene: CallScene },
  { id: "title", Scene: TitleScene },
  { id: "survey", Scene: SurveyScene },
  { id: "septic", Scene: SepticScene },
  { id: "zoning", Scene: ZoningScene },
  { id: "release", Scene: ReleaseScene },
  { id: "receipts", Scene: ReceiptsScene },
  { id: "held", Scene: HeldScene, bonus: true },
];

/** How long autoplay stays on a step. */
export const STEP_MS = 8000;

/** The step a `?step=` value names (1-based), or the first. */
export function stepIndex(value: string | null, count = WALK_STEPS.length): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), count) - 1 : 0;
}
