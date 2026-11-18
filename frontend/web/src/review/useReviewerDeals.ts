import { useCallback, useEffect, useState } from "react";
import { stagedDemoDeals, type Deal } from "@groundtruth/shared";
import { getDeal } from "../data/dealSource";

/** How often the portal re-reads the deals (the Stream updates them). */
const REFRESH_MS = 4_000;

export type ReviewerDeals =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; deals: Deal[] };

/**
 * The staged deals where `wallet` is an assigned reviewer, read from the
 * GroundTruth API (GET /api/deals/:id for each public staged deal) and
 * refreshed every few seconds.
 */
export function useReviewerDeals(wallet: string | null): {
  state: ReviewerDeals;
  refresh: () => void;
} {
  const [state, setState] = useState<ReviewerDeals>({ status: "idle" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!wallet) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));
    void Promise.all(stagedDemoDeals.map((deal) => getDeal(deal.id, controller.signal)))
      .then((outcomes) => {
        if (controller.signal.aborted) return;
        if (outcomes.every((o) => o.status === "error")) {
          setState({ status: "error" });
          return;
        }
        const deals = outcomes.flatMap((o) =>
          o.status === "found" && o.deal.reviewers.some((r) => r.wallet === wallet) ? [o.deal] : [],
        );
        setState({ status: "ready", deals });
      })
      .catch(() => {});
    const timer = setTimeout(() => setTick((n) => n + 1), REFRESH_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [wallet, tick]);

  return { state, refresh };
}
