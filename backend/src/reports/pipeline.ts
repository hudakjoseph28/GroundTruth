import {
  CHECK_KINDS,
  type Check,
  type CheckKind,
  type CheckStatus,
  type Parcel,
  type ParcelReport,
} from "@groundtruth/shared";
import type { FemaFloodClient, FloodOutcome } from "./femaFlood.js";
import { floodCheck } from "./floodCheck.js";
import {
  FRANKLIN_COUNTY_FIPS,
  type FranklinZoningClient,
} from "./franklinZoning.js";
import { zoningCheck } from "./zoningCheck.js";
import { accessCheck } from "./accessCheck.js";
import type { FranklinAccessClient } from "./franklinAccess.js";
import { TEMPLATE_KINDS, templateCheck } from "./templates.js";

export const DEFAULT_FEMA_TIMEOUT_MS = 6_000;
export const DEFAULT_ZONING_TIMEOUT_MS = 6_000;
export const DEFAULT_ACCESS_TIMEOUT_MS = 6_000;
/** Template checks do no I/O; the limit only guards against a bug. */
const TEMPLATE_TIMEOUT_MS = 1_000;

export interface ReportPipelineOptions {
  fema: FemaFloodClient;
  /** Limit for the whole flood check (all FEMA queries together). */
  floodTimeoutMs: number;
  /**
   * Franklin County's zoning map. When set, Franklin parcels get a live
   * zoning check; every other county keeps the zoning template.
   */
  zoning?: FranklinZoningClient;
  /** Limit for the zoning check. */
  zoningTimeoutMs?: number;
  /**
   * Franklin County's right-of-way and road layers. When set, Franklin
   * parcels get a live access check; every other county keeps the template.
   */
  access?: FranklinAccessClient;
  /** Limit for the access check (all its queries together). */
  accessTimeoutMs?: number;
  now: () => Date;
}

export interface BuiltReport {
  report: ParcelReport;
  /**
   * False when any check failed for a passing reason (timeout, provider
   * down, crash). Such a report is still served, but not cached, so the
   * next request asks the provider again.
   */
  complete: boolean;
}

interface CheckResult {
  check: Check;
  transient: boolean;
  /** Set by the flood check when FEMA found a Special Flood Hazard Area. */
  floodInSfha?: boolean;
}

interface CheckRunner {
  kind: CheckKind;
  timeoutMs: number;
  run(signal: AbortSignal): Promise<CheckResult>;
  /** What the check says when it runs out of time or throws. */
  failed(cause: "timedOut" | "unavailable"): CheckResult;
}

/**
 * Builds a live report for one OGRIP parcel. Every check runs at the same
 * time with its own limit; a slow, failed, or crashing check becomes an
 * `unknown` check and never fails the report.
 */
export async function buildReport(
  parcel: Parcel,
  options: ReportPipelineOptions,
): Promise<BuiltReport> {
  const flood: CheckRunner = {
    kind: "flood",
    timeoutMs: options.floodTimeoutMs,
    async run(signal) {
      const outcome = await options.fema.floodZones(
        parcel.geometry.geojson,
        signal,
      );
      return {
        check: floodCheck(outcome, options.floodTimeoutMs),
        transient: outcome.outcome === "timeout",
        floodInSfha: inSfha(outcome),
      };
    },
    failed: (cause) => ({
      check: floodCheck({ outcome: "timeout", cause }, options.floodTimeoutMs),
      transient: true,
    }),
  };
  const franklin = parcel.countyFips === FRANKLIN_COUNTY_FIPS;
  const zoningClient = franklin ? options.zoning : undefined;
  const zoningTimeoutMs = options.zoningTimeoutMs ?? DEFAULT_ZONING_TIMEOUT_MS;
  const zoning: CheckRunner | null = zoningClient
    ? {
        kind: "zoning",
        timeoutMs: zoningTimeoutMs,
        async run(signal) {
          const outcome = await zoningClient.zoning(
            parcel.geometry.geojson,
            signal,
          );
          return {
            check: zoningCheck(outcome, zoningTimeoutMs),
            transient: outcome.outcome === "timeout",
          };
        },
        failed: (cause) => ({
          check: zoningCheck({ outcome: "timeout", cause }, zoningTimeoutMs),
          transient: true,
        }),
      }
    : null;
  const accessClient = franklin ? options.access : undefined;
  const accessTimeoutMs = options.accessTimeoutMs ?? DEFAULT_ACCESS_TIMEOUT_MS;
  const access: CheckRunner | null = accessClient
    ? {
        kind: "access",
        timeoutMs: accessTimeoutMs,
        async run(signal) {
          const outcome = await accessClient.access(
            parcel.geometry.geojson,
            signal,
          );
          return {
            check: accessCheck(outcome, accessTimeoutMs),
            transient: outcome.outcome === "timeout",
          };
        },
        failed: (cause) => ({
          check: accessCheck({ outcome: "timeout", cause }, accessTimeoutMs),
          transient: true,
        }),
      }
    : null;
  const live = [zoning, access].filter(
    (runner): runner is CheckRunner => runner !== null,
  );
  const templates = TEMPLATE_KINDS.filter(
    (kind) => !live.some((runner) => runner.kind === kind),
  ).map(
    (kind): CheckRunner => ({
      kind,
      timeoutMs: TEMPLATE_TIMEOUT_MS,
      run: async () => ({
        check: templateCheck(kind, parcel),
        transient: false,
      }),
      failed: () => ({ check: couldNotRun(kind), transient: true }),
    }),
  );

  const runners = [flood, ...live, ...templates].sort(
    (a, b) => CHECK_KINDS.indexOf(a.kind) - CHECK_KINDS.indexOf(b.kind),
  );
  const settled = await Promise.allSettled(runners.map(runWithTimeout));
  const results = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : // runWithTimeout already catches; this guards `failed` itself.
        {
          check: couldNotRun(runners[index]?.kind ?? "flood"),
          transient: true,
        },
  );
  const checks = results.map((result) => result.check);
  const floodInSfha = results.some((result) => result.floodInSfha === true);

  return {
    report: {
      parcelKey: parcel.key,
      generatedAt: options.now().toISOString(),
      coverage: reportCoverage(checks),
      biggestOpenQuestion: biggestOpenQuestion(checks, { floodInSfha }),
      checks,
    },
    complete: results.every((result) => !result.transient),
  };
}

async function runWithTimeout(runner: CheckRunner): Promise<CheckResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(runner.failed("timedOut"));
    }, runner.timeoutMs);
  });
  try {
    return await Promise.race([runner.run(controller.signal), timedOut]);
  } catch {
    return runner.failed("unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function inSfha(outcome: FloodOutcome): boolean {
  return (
    outcome.outcome === "found" &&
    outcome.zones.some((zone) => zone.specialFloodHazardArea)
  );
}

function couldNotRun(kind: CheckKind): Check {
  return {
    kind,
    status: "unknown",
    finding: "GroundTruth could not run this check.",
    limitation: "No conclusion either way.",
    sources: [],
    responsibleParty: { role: "GroundTruth support" },
    nextAction: "Reload the report to run the check again.",
  };
}

/**
 * `boundaryOnly`: no check is backed by a source (only the OGRIP boundary
 * is). `deep`: every check is. `partial`: anything in between.
 */
export function reportCoverage(checks: Check[]): ParcelReport["coverage"] {
  const supported = checks.filter((check) => check.status !== "unknown");
  if (supported.length === 0) return "boundaryOnly";
  return supported.length === checks.length ? "deep" : "partial";
}

/**
 * Which question decides whether a first-time buyer can use vacant land,
 * most decisive first. Access and wastewater come first: a lot with no
 * legal access, or no sewer and no workable septic site, usually cannot be
 * built on at all.
 */
export const OPEN_QUESTION_PRIORITY = [
  "access",
  "septic",
  "zoning",
  "flood",
  "utilities",
  "easements",
  "sellerAuthority",
  "survey",
  "closing",
] as const satisfies readonly CheckKind[];

const OPEN: ReadonlySet<CheckStatus> = new Set(["unknown", "needsReview"]);

/**
 * The biggest open question, in this order:
 *
 * 1. A `held` check: a reviewer has blocked the closing.
 * 2. Otherwise the first unresolved (`unknown` or `needsReview`) check in
 *    OPEN_QUESTION_PRIORITY. Any unresolved question outranks any resolved
 *    finding, so an unknown access or septic check beats a found flood zone.
 * 3. Otherwise, if the flood check found a Special Flood Hazard Area, flood:
 *    it is the one resolved finding that still carries a cost.
 * 4. Otherwise the first check in OPEN_QUESTION_PRIORITY.
 *
 * ParcelReport requires a kind, so an empty list returns `access`.
 */
export function biggestOpenQuestion(
  checks: Check[],
  context: { floodInSfha: boolean },
): CheckKind {
  const byPriority = [...checks].sort(
    (a, b) => priority(a.kind) - priority(b.kind),
  );
  const held = byPriority.find((check) => check.status === "held");
  if (held) return held.kind;
  const open = byPriority.find((check) => OPEN.has(check.status));
  if (open) return open.kind;
  if (context.floodInSfha && checks.some((check) => check.kind === "flood")) {
    return "flood";
  }
  return byPriority[0]?.kind ?? OPEN_QUESTION_PRIORITY[0];
}

function priority(kind: CheckKind): number {
  const index = OPEN_QUESTION_PRIORITY.indexOf(kind);
  return index === -1 ? OPEN_QUESTION_PRIORITY.length : index;
}
