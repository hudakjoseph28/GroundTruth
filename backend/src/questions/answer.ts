import {
  CHECK_KINDS,
  type Check,
  type CheckKind,
  type ParcelAnswer,
  type ParcelReport,
} from "@groundtruth/shared";

export interface CheckSelection {
  mode: "answered" | "not_covered";
  checkKinds: CheckKind[];
  responsibleCheckKind: CheckKind | null;
}

export interface CheckSelector {
  select(args: {
    question: string;
    report: ParcelReport;
    eligibleKinds: CheckKind[];
  }): Promise<CheckSelection>;
}

const TOPICS: Record<CheckKind, RegExp> = {
  zoning:
    /\b(zon(?:e|ed|ing)|use|permit|setback|house|home|build|structure)\b/i,
  flood: /\b(flood|fema|water|inundat|zone x|floodplain)\b/i,
  environmental: /\b(wetland|stream|environment|habitat|riparian|darby)\b/i,
  access: /\b(access|road|driveway|right[- ]of[- ]way|landlocked)\b/i,
  utilities: /\b(utilit|water line|sewer|electric|gas|power)\b/i,
  easements: /\b(easement|right[- ]of[- ]way|encumbrance)\b/i,
  sellerAuthority: /\b(seller|owner|authority|title|fraud)\b/i,
  survey: /\b(survey|boundary|acre|corner|line)\b/i,
  septic: /\b(septic|soil|perc|leach|wastewater)\b/i,
  closing: /\b(closing|escrow|pay|money|release|refund)\b/i,
};

const UNSUPPORTED =
  /\b(tax(?:es)?|price|worth|value|apprais|school|crime|broadband|internet|cell (?:service|coverage)|current owner|who owns|trustworthy|construction cost|well cost|bedroom|square feet|square footage|endangered species)\b/i;
const FORBIDDEN = /\bsafe\b|\byou can build\b/i;

export const CHECK_TITLES: Record<CheckKind, string> = {
  zoning: "Zoning and allowed use",
  flood: "Flood mapping",
  environmental: "Wetlands and environmental mapping",
  access: "Road and legal access",
  utilities: "Water, sewer, and utilities",
  easements: "Recorded easements",
  sellerAuthority: "Seller authority",
  survey: "Survey and boundary",
  septic: "Septic and soils",
  closing: "Closing and escrow",
};

export async function answerParcelQuestion(
  report: ParcelReport,
  question: string,
  selector: CheckSelector,
): Promise<ParcelAnswer> {
  const normalized = question.trim();
  const matchingKinds = CHECK_KINDS.filter((kind) =>
    TOPICS[kind].test(normalized),
  );
  const eligibleKinds = matchingKinds.filter((kind) => {
    const check = report.checks.find((candidate) => candidate.kind === kind);
    return check && check.status !== "unknown" && check.sources.length > 0;
  });

  if (UNSUPPORTED.test(normalized) || eligibleKinds.length === 0) {
    return notCovered(report, matchingKinds[0] ?? null);
  }

  const selection = await selector.select({
    question: normalized,
    report,
    eligibleKinds,
  });
  if (selection.mode === "not_covered") {
    return notCovered(report, selection.responsibleCheckKind);
  }

  const selected = unique(selection.checkKinds).filter((kind) =>
    eligibleKinds.includes(kind),
  );
  const checks = selected.flatMap((kind) => {
    const check = report.checks.find((candidate) => candidate.kind === kind);
    return check ? [check] : [];
  });
  if (
    checks.length === 0 ||
    checks.some((check) => checkHasForbiddenText(check))
  ) {
    return notCovered(
      report,
      selection.responsibleCheckKind ?? matchingKinds[0] ?? null,
    );
  }

  const answer = checks
    .map(
      (check) =>
        `${check.finding} Limitation: ${check.limitation} Next step: ${check.nextAction}`,
    )
    .join(" ");
  if (FORBIDDEN.test(answer))
    return notCovered(report, checks[0]?.kind ?? null);

  return {
    answer,
    covered: true,
    citations: checks.flatMap((check) =>
      check.sources.map((source) => ({
        checkKind: check.kind,
        checkTitle: CHECK_TITLES[check.kind],
        source,
      })),
    ),
    responsibleParty: checks[0]!.responsibleParty,
  };
}

function notCovered(
  report: ParcelReport,
  preferredKind: CheckKind | null,
): ParcelAnswer {
  const check =
    report.checks.find((candidate) => candidate.kind === preferredKind) ??
    report.checks.find(
      (candidate) => candidate.kind === report.biggestOpenQuestion,
    ) ??
    report.checks[0];
  if (!check) throw new Error("Parcel report has no checks");
  const nextAction = FORBIDDEN.test(check.nextAction)
    ? "Contact that responsible party to resolve the open question."
    : check.nextAction;

  return {
    answer: `This parcel report doesn't cover that question, so I don't know from the report. The responsible party named in the report is ${partyName(check)}. Next step: ${nextAction}`,
    covered: false,
    citations: check.sources.length
      ? check.sources.map((source) => ({
          checkKind: check.kind,
          checkTitle: CHECK_TITLES[check.kind],
          source,
        }))
      : [{ checkKind: check.kind, checkTitle: CHECK_TITLES[check.kind] }],
    responsibleParty: check.responsibleParty,
  };
}

function partyName(check: Check): string {
  return check.responsibleParty.organization
    ? `${check.responsibleParty.role} at ${check.responsibleParty.organization}`
    : check.responsibleParty.role;
}

function checkHasForbiddenText(check: Check): boolean {
  return [check.finding, check.limitation, check.nextAction].some((value) =>
    FORBIDDEN.test(value),
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
