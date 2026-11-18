import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import "../parcel/parcel.css";
import { ESCROW } from "../content/parcel";
import { explorerTxUrl, shortAddress } from "../data/ledger";
import type { ChainBlock } from "./chainBlocks";

/** Confirmed events as glass cards. Outlines are steps that have not happened. */
export function ChainStrip({
  blocks,
  outlines = [],
}: {
  blocks: readonly ChainBlock[];
  outlines?: readonly ChainBlock[];
}) {
  const items = [...blocks, ...outlines];
  const scroller = useRef<HTMLOListElement>(null);
  const more = useOverflow(scroller, items.length);
  if (items.length === 0) return null;

  return (
    <ol className="block-strip" ref={scroller} data-more={more}>
      {items.map((block, index) => (
        <li
          key={block.id}
          data-tone={block.tone}
          data-outline={block.outline ? "true" : "false"}
          data-hero={block.hero ? "true" : "false"}
          data-pulse={block.pulse ? "true" : "false"}
          data-join={
            items[index + 1] ? (items[index + 1]?.outline ? "dashed" : "solid") : "end"
          }
          style={{ "--i": index } as CSSProperties}
        >
          {block.signature ? (
            <a
              className="block-card"
              href={explorerTxUrl(block.signature)}
              target="_blank"
              rel="noreferrer"
            >
              <BlockBody block={block} />
            </a>
          ) : (
            <div className="block-card">
              <BlockBody block={block} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function BlockBody({ block }: { block: ChainBlock }) {
  const when = new Date(block.at);
  const time = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <>
      <span className="block-mark" aria-hidden="true">
        <Mark mark={block.mark} />
      </span>
      <p className="block-name">{block.label}</p>
      {block.outline ? (
        <p className="block-time">{ESCROW.notYet}</p>
      ) : (
        <time className="block-time" dateTime={block.at}>
          {time}
        </time>
      )}
      {block.signature ? (
        <p className="block-sig mono">
          {shortAddress(block.signature)}
          <span aria-hidden="true"> ↗</span>
        </p>
      ) : (
        <p className="block-sig" />
      )}
    </>
  );
}

function Mark({ mark }: { mark: ChainBlock["mark"] }) {
  if (mark === "lock") {
    return (
      <svg viewBox="0 0 16 16">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
        <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
      </svg>
    );
  }
  if (mark === "coin") {
    return (
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="5.25" />
        <path d="M8 5.1v5.8M6.2 6.5c.4-.7 1-.9 1.8-.9 1 0 1.6.5 1.6 1.25S9 8.1 8 8.1H6.6M6.6 8.1h2.2c1 0 1.5.45 1.5 1.15s-.7 1.2-1.7 1.2c-.8 0-1.4-.25-1.8-.8" />
      </svg>
    );
  }
  if (mark === "check") return <span>✓</span>;
  if (mark === "blocked") return <span>✕</span>;
  if (mark === "refund") return <span>↩</span>;
  return null;
}

function useOverflow(ref: RefObject<HTMLOListElement | null>, count: number): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 12);
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [ref, count]);
  return more;
}
