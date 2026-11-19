import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { TimelineEvent, TimelineEventType } from "@groundtruth/shared";
import { TIMELINE } from "../content/deal";
import { TICKER, TICKER_DEALS } from "../content/ticker";
import { getDealTimeline } from "../data/dealSource";

export type TickerTone = "gold" | "green" | "red" | "quiet";

export interface TickerItem {
  id: string;
  dealId: string;
  dealLabel: string;
  at: string;
  message: string;
  tone: TickerTone;
  signature?: string;
}

const TONE: Record<TimelineEventType, TickerTone> = {
  dealCreated: "gold",
  funded: "gold",
  evidenceReceived: "quiet",
  approvalSigned: "green",
  holdPlaced: "red",
  releaseRejected: "red",
  released: "green",
  refunded: "quiet",
};

function toItem(dealId: string, dealLabel: string, event: TimelineEvent): TickerItem {
  const confirmed = event.confirmationStatus === "confirmed";
  return {
    id: `${dealId}:${event.id}`,
    dealId,
    dealLabel,
    at: event.at,
    message: event.buyerMessage.trim() || TIMELINE.types[event.type],
    tone: TONE[event.type],
    signature: confirmed ? event.transactionSignature : undefined,
  };
}

/** Newest real rows from the three staged closings. Null until the first answer, and when that answer is empty. */
export function useDealTicker(): { items: TickerItem[] | null; fresh: ReadonlySet<string> } {
  const onDeal = useLocation().pathname.startsWith("/deals/");
  const [items, setItems] = useState<TickerItem[] | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    let seen: Set<string> | null = null;
    let alive = true;

    const schedule = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      const wait = onDeal ? TICKER.dealPollMs : TICKER.pollMs;
      timer = window.setTimeout(() => void load(), wait);
    };

    const load = async () => {
      if (!alive || document.hidden) return;
      let results;
      try {
        results = await Promise.all(
          TICKER_DEALS.map(async (deal) => ({
            deal,
            outcome: await getDealTimeline(deal.id, controller.signal),
          })),
        );
      } catch {
        // Aborted, or the request was replaced. The next poll starts clean.
        return;
      }
      if (!alive) return;
      const found = results.some((result) => result.outcome.status === "found");
      if (!found) {
        schedule();
        return;
      }
      const next = results
        .flatMap((result) =>
          result.outcome.status === "found"
            ? result.outcome.timeline.map((event) => toItem(result.deal.id, result.deal.label, event))
            : [],
        )
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1))
        .slice(0, TICKER.limit);
      if (seen) {
        const arrived = next.filter((item) => !seen?.has(item.id)).map((item) => item.id);
        if (arrived.length > 0) {
          const ids = new Set(arrived);
          setFresh(ids);
          window.setTimeout(() => {
            if (alive) setFresh(new Set());
          }, TICKER.freshMs);
        }
      }
      seen = new Set(next.map((item) => item.id));
      setItems(next);
      schedule();
    };

    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    void load();
    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onDeal]);

  return { items, fresh };
}
