import {
  CHECK_KINDS,
  CHECK_STATUSES,
  type Check,
  type CheckKind,
  type CheckStatus,
  type ParcelReport,
  type Source,
} from "@groundtruth/shared";

const COVERAGES = ["deep", "partial", "boundaryOnly"] as const;

export interface StoredSource {
  position: number;
  authority: string;
  title: string;
  url: string;
  retrievedAt: Date;
  effectiveDate: Date | null;
}

export interface StoredCheck {
  position: number;
  kind: string;
  status: string;
  finding: string;
  limitation: string;
  nextAction: string;
  responsibleRole: string;
  responsibleOrganization: string | null;
  publicContactUrl: string | null;
  reviewerWallet: string | null;
  transactionSignature: string | null;
  sources: StoredSource[];
}

export interface StoredReport {
  parcelKey: string;
  generatedAt: Date;
  coverage: string;
  biggestOpenQuestion: string;
  checks: StoredCheck[];
}

export function toParcelReport(row: StoredReport): ParcelReport {
  return {
    parcelKey: row.parcelKey,
    generatedAt: row.generatedAt.toISOString(),
    coverage: parseCoverage(row.coverage),
    biggestOpenQuestion: parseKind(row.biggestOpenQuestion),
    checks: [...row.checks]
      .sort((left, right) => left.position - right.position)
      .map(toCheck),
  };
}

function toCheck(row: StoredCheck): Check {
  const status = parseStatus(row.status);
  const sources = [...row.sources]
    .sort((left, right) => left.position - right.position)
    .map(toSource);
  if (status !== "unknown" && sources.length === 0) {
    throw new Error("Stored check is missing its source");
  }
  const check: Check = {
    kind: parseKind(row.kind),
    status,
    finding: row.finding,
    limitation: row.limitation,
    sources,
    responsibleParty: {
      role: row.responsibleRole,
      organization: row.responsibleOrganization ?? undefined,
      publicContactUrl: row.publicContactUrl ?? undefined,
    },
    nextAction: row.nextAction,
    reviewerWallet: row.reviewerWallet ?? undefined,
    transactionSignature: row.transactionSignature ?? undefined,
  };
  return check;
}

function toSource(row: StoredSource): Source {
  return {
    authority: row.authority,
    title: row.title,
    url: row.url,
    retrievedAt: row.retrievedAt.toISOString(),
    effectiveDate: row.effectiveDate?.toISOString(),
  };
}

function parseCoverage(value: string): ParcelReport["coverage"] {
  const found = COVERAGES.find((item) => item === value);
  if (!found) throw new Error("Stored coverage is outside the contract");
  return found;
}

function parseKind(value: string): CheckKind {
  const found = CHECK_KINDS.find((item) => item === value);
  if (!found) throw new Error("Stored check kind is outside the contract");
  return found;
}

function parseStatus(value: string): CheckStatus {
  const found = CHECK_STATUSES.find((item) => item === value);
  if (!found) throw new Error("Stored check status is outside the contract");
  return found;
}
