import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TICKER } from "../content/ticker";
import { SITE } from "../content/site";
import { dealPath } from "../data/dealSource";
import { explorerTxUrl } from "../data/ledger";
import { useReducedMotion } from "../home/useReducedMotion";
import { useDealTicker, type TickerItem } from "./useDealTicker";

const PHONE = "(max-width: 40rem)";

/** A thin live bar of real escrow events, above the header on every page. */
export function DealTicker() {
  const { items, fresh } = useDealTicker();
  const reduced = useReducedMotion();
  const phone = useMedia(PHONE);
  const visible = items !== null && items.length > 0;
  // Re-render so "2h ago" stays current without inventing a clock of its own.
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClock((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.documentElement.style.setProperty("--ticker-h", "2.125rem");
    return () => {
      document.documentElement.style.removeProperty("--ticker-h");
    };
  }, [visible]);

  if (!visible || !items) return null;

  const mode = reduced ? "still" : phone ? "phone" : "marquee";
  const newest = fresh.size > 0 ? items.find((item) => fresh.has(item.id)) : undefined;

  return (
    <div className="deal-ticker" role="region" aria-label={TICKER.region} data-mode={mode}>
      <p className="ticker-live">
        <span className="ticker-live-dot" aria-hidden="true" />
        {TICKER.label}
      </p>
      {mode === "marquee" ? (
        <div className="ticker-marquee">
          <div
            className="ticker-track"
            style={{ animationDuration: `${Math.max(items.length, 8) * 7}s` }}
          >
            <TickerRow items={items} fresh={fresh} />
            <TickerRow items={items} fresh={fresh} hidden />
          </div>
        </div>
      ) : mode === "phone" ? (
        <PhoneItem items={items} fresh={fresh} />
      ) : (
        <div className="ticker-still">
          {items.slice(0, 3).map((item) => (
            <TickerEvent key={item.id} item={item} fresh={false} />
          ))}
        </div>
      )}
      {newest ? (
        <p className="visually-hidden" aria-live="polite">
          {newest.message}
        </p>
      ) : null}
    </div>
  );
}

function TickerRow({
  items,
  fresh,
  hidden = false,
}: {
  items: readonly TickerItem[];
  fresh: ReadonlySet<string>;
  hidden?: boolean;
}) {
  return (
    <div className="ticker-row" aria-hidden={hidden || undefined} inert={hidden || undefined}>
      {items.map((item) => (
        <TickerEvent key={`${hidden ? "b" : "a"}-${item.id}`} item={item} fresh={fresh.has(item.id)} />
      ))}
    </div>
  );
}

function PhoneItem({ items, fresh }: { items: readonly TickerItem[]; fresh: ReadonlySet<string> }) {
  const [index, setIndex] = useState(0);
  const item = items[index % items.length];
  const itemId = item?.id;

  useEffect(() => {
    if (!itemId || fresh.has(itemId)) return;
    const timer = window.setTimeout(() => setIndex((n) => n + 1), TICKER.phoneMs);
    return () => window.clearTimeout(timer);
  }, [itemId, fresh]);

  useEffect(() => {
    if (fresh.size > 0) setIndex(0);
  }, [fresh]);

  if (!item) return null;
  return (
    <div className="ticker-phone" key={item.id}>
      <TickerEvent item={item} fresh={fresh.has(item.id)} />
    </div>
  );
}

function TickerEvent({ item, fresh }: { item: TickerItem; fresh: boolean }) {
  return (
    <div className="ticker-item" data-tone={item.tone} data-fresh={fresh || undefined}>
      <Link className="ticker-main" to={dealPath(item.dealId)}>
        <span className="ticker-dot" aria-hidden="true" />
        <span className="ticker-event">{item.message}</span>
        <span className="ticker-deal">{item.dealLabel}</span>
        <time dateTime={item.at}>{relativeTime(item.at)}</time>
      </Link>
      {item.signature ? (
        <a
          className="ticker-out"
          href={explorerTxUrl(item.signature)}
          target="_blank"
          rel="noreferrer"
        >
          <span aria-hidden="true">↗</span>
          <span className="visually-hidden">
            {TICKER.explorer} ({SITE.newTab})
          </span>
        </a>
      ) : null}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
