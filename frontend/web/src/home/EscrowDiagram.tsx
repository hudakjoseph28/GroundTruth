import { useEffect, useState } from "react";
import type { ReviewerRole } from "@groundtruth/shared";
import { EXAMPLE_AMOUNT, HOW } from "../content/home";
import { easeOut } from "../parcel/motion";
import { BLOCK, BLOCK_EDGES, CoinMark, LockMark, WalletMark } from "./icons";

export type DiagramMode = "lock" | "held" | "cleared";
type Seal = "waiting" | "signed" | "held";

const D = HOW.diagram;
const ROLES: readonly ReviewerRole[] = ["title", "survey", "septic"];

const SEALS: Record<DiagramMode, Record<ReviewerRole, Seal>> = {
  lock: { title: "waiting", survey: "waiting", septic: "waiting" },
  held: { title: "held", survey: "signed", septic: "signed" },
  cleared: { title: "signed", survey: "signed", septic: "signed" },
};

/** How long each mode's opening move takes before it settles. */
const LEAD_MS: Record<DiagramMode, number> = { lock: 2100, held: 0, cleared: 1200 };
const COUNT_MS = 1900;

/**
 * The escrow as a diagram: buyer, the escrow block with its three reviewer
 * slots, seller. "lock" funds it, "held" shows a release being refused, and
 * "cleared" pays the seller. An illustration, labeled as one where it is used.
 *
 * Give it a new `key` to play it again from the start.
 */
export function EscrowDiagram({
  mode,
  running,
  still,
}: {
  mode: DiagramMode;
  /** False while the diagram is out of view: it waits on its first frame. */
  running: boolean;
  /** True for reduced motion: the final frame, unmoving. */
  still: boolean;
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!running || still) return;
    const timer = window.setTimeout(() => setSettled(true), LEAD_MS[mode]);
    return () => window.clearTimeout(timer);
  }, [running, still, mode]);
  const done = still || settled;

  // The readout only counts while the escrow is being funded.
  const [counted, setCounted] = useState(0);
  const counting = mode === "lock" && running && !still;
  useEffect(() => {
    if (!counting) return;
    let id = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / COUNT_MS);
      setCounted(Math.round(EXAMPLE_AMOUNT * easeOut(t)));
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [counting]);
  const amount = mode !== "lock" || still ? EXAMPLE_AMOUNT : counted;

  const phase = !running && !still ? "idle" : done ? "done" : "lead";
  const paid = mode === "cleared" && done;

  return (
    <div className="vault" data-mode={mode} data-phase={phase}>
      <ul className="vault-seals">
        {ROLES.map((role, index) => {
          const seal = SEALS[mode][role];
          return (
            <li key={role} data-seal={seal} style={{ "--i": index } as Record<`--${string}`, number>}>
              <svg className="vault-seal" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6.2" />
                {seal === "signed" && <path d="M5.2 8.2 7.2 10.2 10.9 6" />}
                {seal === "held" && <path d="M6.4 5.8v4.4M9.6 5.8v4.4" />}
              </svg>
              <span className="vault-seal-role">{D.roles[role]}</span>
              <span className="vault-seal-state">{D.seal[seal]}</span>
            </li>
          );
        })}
      </ul>

      <div className="vault-row">
        <div className="vault-party" data-party="buyer">
          <WalletMark />
          <span>{D.buyer}</span>
        </div>
        <div className="vault-wire" data-wire="in">
          <i />
          <i />
          <i />
        </div>
        <div className="vault-core">
          <svg className="vault-block" viewBox="0 0 16 16">
            <path d={BLOCK} />
            <path className="vault-block-edges" d={BLOCK_EDGES} />
          </svg>
          <span className="vault-lock">
            <LockMark open={paid} />
          </span>
          <span className="vault-name">{D.escrow}</span>
        </div>
        <div className="vault-wire" data-wire="out">
          <i />
          <i />
          <i />
        </div>
        <div className="vault-party" data-party="seller">
          <WalletMark />
          <span>{D.seller}</span>
        </div>
      </div>

      <p className="vault-amount">
        <CoinMark />
        <span className="mono">{amount.toLocaleString("en-US")}</span> {D.unit}{" "}
        <span className="vault-amount-state">{paid ? D.paid : D.locked}</span>
      </p>
      <p className="vault-result">{mode === "lock" ? D.waiting : D.result[mode]}</p>
    </div>
  );
}
