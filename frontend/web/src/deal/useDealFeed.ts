import { useCallback, useEffect, useState } from "react";
import type { Deal, DealState, TimelineEvent } from "@groundtruth/shared";
import type { FailedOutcome } from "../data/api";
import { getDeal, getDealTimeline } from "../data/dealSource";

/** How often the timeline is read (Decisions.md D10). */
const POLL_MS = 2000;
/** How long a row that arrived live stays marked as new. */
const FRESH_MS = 8000;

export interface LiveDeal {
  status: "ready";
  deal: Deal;
  timeline: TimelineEvent[];
  /** Rows that arrived after the page first loaded, for a few seconds each. */
  freshIds: ReadonlySet<string>;
  /** Set once the deal's state has changed while the page was open. */
  liveState: DealState | null;
  /** When the API last answered. */
  updatedAt: Date;
  /** True while the latest read failed; the page keeps the last good state. */
  stale: boolean;
}

export type DealFeed =
  | { status: "loading" }
  | { status: "missing"; message: string }
  | (FailedOutcome & { retry: () => void })
  | LiveDeal;

type Settled =
  | { status: "missing"; message: string }
  | FailedOutcome
  | LiveDeal;

/**
 * A deal and its timeline, kept current.
 *
 * It reads the deal and the timeline once, then reads the timeline every two
 * seconds. When the timeline has changed it reads the deal again, so the
 * status, reviewers, and hold move together with the row that caused them.
 * Reads stop while the tab is hidden and resume, at once, when it returns.
 */
export function useDealFeed(dealId: string): DealFeed {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; value: Settled } | null>(
    null,
  );
  const key = `${dealId}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const timers = new Set<number>();
    let known = new Set<string>();
    let pollTimer: number | undefined;
    let reading = false;
    let ready = false;
    /** The deal could not be re-read after a new row; try again next time. */
    let dealBehind = false;

    const later = (run: () => void, ms: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        run();
      }, ms);
      timers.add(timer);
      return timer;
    };

    const update = (change: (live: LiveDeal) => LiveDeal) => {
      setSettled((current) =>
        current?.key === key && current.value.status === "ready"
          ? { key, value: change(current.value) }
          : current,
      );
    };

    const stopTimer = () => {
      if (pollTimer === undefined) return;
      window.clearTimeout(pollTimer);
      timers.delete(pollTimer);
      pollTimer = undefined;
    };

    const schedule = () => {
      stopTimer();
      if (signal.aborted || document.hidden) return;
      pollTimer = later(tick, POLL_MS);
    };

    const poll = async () => {
      if (reading || signal.aborted) return;
      reading = true;
      try {
        const outcome = await getDealTimeline(dealId, signal);
        if (outcome.status !== "found") {
          update((live) => ({ ...live, stale: true }));
          return;
        }
        const ids = outcome.timeline.map((event) => event.id);
        const arrived = ids.filter((id) => !known.has(id));
        const changed = arrived.length > 0 || ids.length !== known.size;

        let deal: Deal | null = null;
        if (changed || dealBehind) {
          const dealOutcome = await getDeal(dealId, signal);
          dealBehind = dealOutcome.status !== "found";
          if (dealOutcome.status === "found") deal = dealOutcome.deal;
        }

        known = new Set(ids);
        update((live) => ({
          ...live,
          deal: deal ?? live.deal,
          timeline: outcome.timeline,
          freshIds: new Set([...live.freshIds, ...arrived]),
          liveState:
            deal && deal.state !== live.deal.state ? deal.state : live.liveState,
          updatedAt: new Date(),
          stale: dealBehind,
        }));
        if (arrived.length > 0) {
          later(() => {
            update((live) => ({
              ...live,
              freshIds: new Set(
                [...live.freshIds].filter((id) => !arrived.includes(id)),
              ),
            }));
          }, FRESH_MS);
        }
      } finally {
        reading = false;
        schedule();
      }
    };

    const tick = () => {
      poll().catch(() => {
        // Aborted: the page closed or moved to another deal.
      });
    };

    const load = async () => {
      const [dealOutcome, timelineOutcome] = await Promise.all([
        getDeal(dealId, signal),
        getDealTimeline(dealId, signal),
      ]);
      if (dealOutcome.status !== "found") {
        setSettled({ key, value: dealOutcome });
        return;
      }
      if (timelineOutcome.status !== "found") {
        setSettled({ key, value: timelineOutcome });
        return;
      }
      known = new Set(timelineOutcome.timeline.map((event) => event.id));
      ready = true;
      setSettled({
        key,
        value: {
          status: "ready",
          deal: dealOutcome.deal,
          timeline: timelineOutcome.timeline,
          freshIds: new Set(),
          liveState: null,
          updatedAt: new Date(),
          stale: false,
        },
      });
      schedule();
    };

    const onVisibility = () => {
      if (document.hidden) stopTimer();
      else if (ready) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    load().catch(() => {
      // Aborted: the page closed or moved to another deal.
    });

    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [dealId, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (settled?.key !== key) return { status: "loading" };
  const { value } = settled;
  return value.status === "error" ? { ...value, retry } : value;
}
