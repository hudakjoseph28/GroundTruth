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
import { septicCheck } from "./septicCheck.js";
import type { SsurgoSoilsClient } from "./ssurgoSoils.js";
import { environmentalCheck } from "./environmentalCheck.js";
import type {
  FranklinStreamBuffersClient,
  StreamSetbackOutcome,
} from "./franklinStreamBuffers.js";
import type { NwiWetlandsClient, WetlandsOutcome } from "./nwiWetlands.js";
import { TEMPLATE_KINDS, templateCheck } from "./templates.js";

export const DEFAULT_FEMA_TIMEOUT_MS = 6_000;
export const DEFAULT_ZONING_TIMEOUT_MS = 6_000;
export const DEFAULT_ACCESS_TIMEOUT_MS = 6_000;
export const DEFAULT_SOILS_TIMEOUT_MS = 6_000;
/**
 * NWI answered in 2.0 to 5.3 s on five Ohio lots on 2026-11-18 (two queries,
 * then one drawing when wetlands are mapped), and took 8.5 s once.
 */
export const DEFAULT_WETLANDS_TIMEOUT_MS = 10_000;
/** The county layer answers in 0.2 s; a first setback download takes ~2 s. */
export const DEFAULT_STREAM_BUFFERS_TIMEOUT_MS = 6_000;
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
  /** USDA NRCS SSURGO (Soil Data Access, Living Atlas fallback), for every parcel. */
  soils?: SsurgoSoilsClient;
  /** Limit for the SSURGO soils/septic check. */
  soilsTimeoutMs?: number;
  /**
   * The National Wetlands Inventory. When set, every parcel gets a live
   * environmental check; otherwise it keeps the template.
   */
  wetlands?: NwiWetlandsClient;
  /** Limit for the NWI part of the environmental check. */
  wetlandsTimeoutMs?: number;
  /**
   * Franklin County's stream-buffer layer. When set (with `wetlands`),
   * Franklin parcels' environmental check also reports riparian setbacks.
   */
  streamBuffers?: FranklinStreamBuffersClient;
  /** Limit for the stream-setback part of the environmental check. */
  streamBuffersTimeoutMs?: number;
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
  /** Set by the flood check when FEMA found a regulatory floodway. */
  floodway?: boolean;
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
        floodway: inFloodway(outcome),
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
  const soilsClient = options.soils;
  const soilsTimeoutMs = options.soilsTimeoutMs ?? DEFAULT_SOILS_TIMEOUT_MS;
  const soils: CheckRunner | null = soilsClient
    ? {
        kind: "septic",
        timeoutMs: soilsTimeoutMs,
        async run(signal) {
          const outcome = await soilsClient.septicSuitability(
            parcel.geometry.geojson,
            signal,
          );
          return {
            check: septicCheck(parcel, outcome, soilsTimeoutMs),
            transient: outcome.outcome === "timeout",
          };
        },
        failed: (cause) => ({
          check: septicCheck(
            parcel,
            { outcome: "timeout", cause },
            soilsTimeoutMs,
          ),
          transient: true,
        }),
      }
    : null;
  const wetlandsClient = options.wetlands;
  const wetlandsTimeoutMs =
    options.wetlandsTimeoutMs ?? DEFAULT_WETLANDS_TIMEOUT_MS;
  const setbacksClient = franklin ? options.streamBuffers : undefined;
  const setbacksTimeoutMs =
    options.streamBuffersTimeoutMs ?? DEFAULT_STREAM_BUFFERS_TIMEOUT_MS;
  const environmentalInputs = (
    wetlands: WetlandsOutcome,
    setbacks: StreamSetbackOutcome | null,
  ) => ({ wetlands, wetlandsTimeoutMs, setbacks, setbacksTimeoutMs });
  const environmental: CheckRunner | null = wetlandsClient
    ? {
        kind: "environmental",
        // Each source runs on its own limit below; this one only guards
        // against a bug that ignores them.
        timeoutMs:
          Math.max(wetlandsTimeoutMs, setbacksClient ? setbacksTimeoutMs : 0) +
          1_000,
        async run(signal) {
          const [wetlands, setbacks] = await Promise.all([
            withLimit(
              wetlandsTimeoutMs,
              signal,
              (limited) =>
                wetlandsClient.wetlands(parcel.geometry.geojson, limited),
              { outcome: "timeout", cause: "timedOut" } as const,
            ),
            setbacksClient
              ? withLimit(
                  setbacksTimeoutMs,
                  signal,
                  (limited) =>
                    setbacksClient.setbacks(parcel.geometry.geojson, limited),
                  { outcome: "timeout", cause: "timedOut" } as const,
                )
              : null,
          ]);
          return {
            check: environmentalCheck(
              parcel,
              environmentalInputs(wetlands, setbacks),
            ),
            transient:
              wetlands.outcome === "timeout" || setbacks?.outcome === "timeout",
          };
        },
        failed: (cause) => ({
          check: environmentalCheck(
            parcel,
            environmentalInputs(
              { outcome: "timeout", cause },
              setbacksClient ? { outcome: "timeout", cause } : null,
            ),
          ),
          transient: true,
        }),
      }
    : null;
  const live = [zoning, environmental, access, soils].filter(
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
  const floodway = results.some((result) => result.floodway === true);

  return {
    report: {
      parcelKey: parcel.key,
      generatedAt: options.now().toISOString(),
      coverage: reportCoverage(checks),
      biggestOpenQuestion: biggestOpenQuestion(checks, { floodInSfha, floodway }),
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

/**
 * One source's own limit inside a check that reads several: `run` gets a
 * signal that aborts after `ms` or when the whole check stops, and a source
 * that ignores it still yields `onTimeout` on time.
 */
async function withLimit<T>(
  ms: number,
  parent: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
  onTimeout: T,
): Promise<T> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  parent.addEventListener("abort", stop, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(onTimeout);
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", stop);
  }
}

function inSfha(outcome: FloodOutcome): boolean {
  return (
    outcome.outcome === "found" &&
    outcome.zones.some((zone) => zone.specialFloodHazardArea)
  );
}

function inFloodway(outcome: FloodOutcome): boolean {
  return (
    outcome.outcome === "found" &&
    outcome.zones.some((zone) => zone.subtype === "FLOODWAY")
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
 * built on at all. Wetlands and stream setbacks follow zoning: they limit
 * where on the lot you can build, and a mapped wetland can need a permit.
 */
export const OPEN_QUESTION_PRIORITY = [
  "access",
  "septic",
  "zoning",
  "environmental",
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
 * 2. An open flood check that found a regulatory floodway on any part of
 *    the lot. Building in a floodway is usually the hardest blocker there
 *    is, so it leads every other open question.
 * 3. Otherwise the first unresolved (`unknown` or `needsReview`) check in
 *    OPEN_QUESTION_PRIORITY, except that an open flood check in a Special
 *    Flood Hazard Area (no floodway) ranks right after access, ahead of
 *    septic. Any unresolved question outranks any resolved finding, so an
 *    unknown access or septic check beats a Zone X flood finding.
 * 4. Otherwise, if the flood check found a Special Flood Hazard Area, flood:
 *    a resolved finding that still carries a cost (a report written before
 *    such a flood check became `needsReview`).
 * 5. Otherwise the first check in OPEN_QUESTION_PRIORITY.
 *
 * ParcelReport requires a kind, so an empty list returns `access`.
 */
export function biggestOpenQuestion(
  checks: Check[],
  context: { floodInSfha: boolean; floodway?: boolean },
): CheckKind {
  const sfhaFlood = context.floodInSfha || context.floodway === true;
  const rank = (kind: CheckKind) =>
    kind === "flood" && sfhaFlood ? SFHA_FLOOD_RANK : priority(kind);
  const byPriority = [...checks].sort((a, b) => rank(a.kind) - rank(b.kind));
  const held = byPriority.find((check) => check.status === "held");
  if (held) return held.kind;
  const flood = checks.find((check) => check.kind === "flood");
  if (context.floodway && flood && OPEN.has(flood.status)) return "flood";
  const open = byPriority.find((check) => OPEN.has(check.status));
  if (open) return open.kind;
  if (context.floodInSfha && flood) return "flood";
  return byPriority[0]?.kind ?? OPEN_QUESTION_PRIORITY[0];
}

/** Right after access, ahead of septic (0.5 sorts between ranks 0 and 1). */
const SFHA_FLOOD_RANK = OPEN_QUESTION_PRIORITY.indexOf("access") + 0.5;

function priority(kind: CheckKind): number {
  const index = OPEN_QUESTION_PRIORITY.indexOf(kind);
  return index === -1 ? OPEN_QUESTION_PRIORITY.length : index;
}
