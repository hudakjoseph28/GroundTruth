import type {
  Check,
  CheckKind,
  CheckStatus,
  Deal,
  DealState,
  Parcel,
  ParcelReport,
  ResponsibleParty,
  Reviewer,
  Source,
  TimelineEvent,
} from "@groundtruth/shared";

import {
  CHECK_KINDS,
  CHECK_STATUSES,
  DEAL_STATES,
  goldenParcel,
  goldenReport,
  stagedDeal,
} from "@groundtruth/shared";

type ContractSurface = {
  parcel: Parcel;
  check: Check;
  source: Source;
  party: ResponsibleParty;
  report: ParcelReport;
  deal: Deal;
  reviewer: Reviewer;
  event: TimelineEvent;
  kind: CheckKind;
  status: CheckStatus;
  state: DealState;
};

const kinds: readonly CheckKind[] = CHECK_KINDS;
const statuses: readonly CheckStatus[] = CHECK_STATUSES;
const states: readonly DealState[] = DEAL_STATES;

const surface = {
  parcel: goldenParcel,
  report: goldenReport,
  deal: stagedDeal,
  kind: kinds[0],
  status: statuses[2],
  state: states[0],
} satisfies Pick<
  ContractSurface,
  "parcel" | "report" | "deal" | "kind" | "status" | "state"
>;

void surface;
