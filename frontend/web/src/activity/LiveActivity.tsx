import { ACTIVITY } from "../content/activity";
import { SITE } from "../content/site";
import { Reveal } from "../home/Reveal";
import { timeAgo, type ActivityRow } from "./activityRow";
import { useActivityFeed } from "./useActivityFeed";
import "./activity.css";

/**
 * "Live on Solana devnet": the newest confirmed escrow program events across
 * the staged demo deals, each linking to its transaction on Explorer.
 */
export function LiveActivity() {
  const { rows, failed, fresh, now } = useActivityFeed();
  const newest = rows?.find((row) => fresh.has(row.id));

  return (
    <Reveal className="section live-activity">
      <section aria-labelledby="live-activity-title">
        <p className="eyebrow live-activity-eyebrow">
          <span className="live-activity-pulse" aria-hidden="true" />
          {ACTIVITY.title}
        </p>
        <h2 id="live-activity-title" className="visually-hidden">
          {ACTIVITY.title}
        </h2>
        <p className="live-activity-lede">{ACTIVITY.lede}</p>
        {rows === null ? (
          <p className="live-activity-note" role="status">
            {failed ? ACTIVITY.failed : ACTIVITY.loading}
          </p>
        ) : rows.length === 0 ? (
          <p className="live-activity-note" role="status">
            {failed ? ACTIVITY.failed : ACTIVITY.empty}
          </p>
        ) : (
          <>
            <ol className="live-activity-list">
              {rows.map((row) => (
                <ActivityItem
                  key={row.id}
                  row={row}
                  fresh={fresh.has(row.id)}
                  now={now}
                />
              ))}
            </ol>
            {failed ? (
              <p className="live-activity-note" role="status">
                {ACTIVITY.stale}
              </p>
            ) : null}
          </>
        )}
        <p className="visually-hidden" aria-live="polite">
          {newest ? `${newest.what}, ${newest.deal}` : ""}
        </p>
      </section>
    </Reveal>
  );
}

function ActivityItem({
  row,
  fresh,
  now,
}: {
  row: ActivityRow;
  fresh: boolean;
  now: number;
}) {
  return (
    <li
      className="live-activity-item"
      data-tone={row.tone}
      data-fresh={fresh || undefined}
    >
      <a href={row.href} target="_blank" rel="noreferrer">
        <span className="live-activity-dot" aria-hidden="true" />
        <span className="live-activity-what">{row.what}</span>
        <span className="live-activity-meta">
          <span>{row.deal}</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={row.at}>{timeAgo(row.at, now)}</time>
        </span>
        <span className="live-activity-out" aria-hidden="true">
          ↗
        </span>
        <span className="visually-hidden">
          {" "}
          {ACTIVITY.explorer} ({SITE.newTab})
        </span>
      </a>
    </li>
  );
}
