import { useEffect, useState } from "react";
import { ACTIVITY } from "../content/activity";
import { getActivity } from "../data/activitySource";
import { toActivityRow, type ActivityRow } from "./activityRow";

export interface ActivityFeed {
  /** Null until the first answer arrives. */
  rows: ActivityRow[] | null;
  /** The last request failed. With rows, they are the last good answer. */
  failed: boolean;
  /** Rows that arrived on the latest poll; empty on the first load. */
  fresh: ReadonlySet<string>;
  /** When the latest answer arrived, for "2 min ago". */
  now: number;
}

/**
 * Polls GET /api/activity every 5 s while the tab is visible. A failed poll
 * keeps the last answer on screen and says so; it never empties the list.
 */
export function useActivityFeed(): ActivityFeed {
  const [feed, setFeed] = useState<ActivityFeed>({
    rows: null,
    failed: false,
    fresh: new Set(),
    now: Date.now(),
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    let freshTimer = 0;
    let seen: Set<string> | null = null;
    let alive = true;

    const schedule = () => {
      window.clearTimeout(timer);
      if (!document.hidden)
        timer = window.setTimeout(() => void load(), ACTIVITY.pollMs);
    };

    const load = async () => {
      if (!alive || document.hidden) return;
      let outcome;
      try {
        outcome = await getActivity(controller.signal);
      } catch {
        return; // Aborted on unmount.
      }
      if (!alive) return;
      if (outcome.status !== "found") {
        setFeed((last) => ({
          ...last,
          failed: true,
          fresh: new Set(),
          now: Date.now(),
        }));
        schedule();
        return;
      }
      const rows = outcome.events.map(toActivityRow);
      const arrived = seen
        ? rows.filter((row) => !seen?.has(row.id)).map((row) => row.id)
        : [];
      seen = new Set(rows.map((row) => row.id));
      setFeed({
        rows,
        failed: false,
        fresh: new Set(arrived),
        now: Date.now(),
      });
      if (arrived.length > 0) {
        window.clearTimeout(freshTimer);
        freshTimer = window.setTimeout(() => {
          if (alive) setFeed((last) => ({ ...last, fresh: new Set() }));
        }, ACTIVITY.freshMs);
      }
      schedule();
    };

    const onVisible = () => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void load();
    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(freshTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return feed;
}
