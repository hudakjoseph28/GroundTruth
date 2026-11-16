import { useEffect, useRef, useState } from "react";
import { stagedDeal, type ReviewerRole } from "@groundtruth/shared";
import { REVIEWERS } from "../content/home";
import { shortAddress } from "../data/ledger";
import { PALETTE, rgb } from "../globe/palette";
import { cubeCorners, drawBox } from "../parcel/BlockTransition/chain";
import { clamp01, easeInOut, easeOut } from "../parcel/motion";
import { usePageHidden } from "../parcel/usePageHidden";
import { Icon, LockMark, WalletMark } from "./icons";

// A chain of blocks moving slowly left. Every few seconds a reviewer signs, a
// packet drops from their wallet into the next block, and the block shows a
// short receipt while the escrow's count goes up. One loop in three, the title
// agent places a hold instead. An illustration: the wallets are the staged
// fixture's, shortened, and no receipt is a transaction.

/** One block's worth of time. */
const SLOT_MS = 2600;
/** Blocks in one loop: three sign-offs and a plain block to breathe. */
const SLOTS = 4;
const LOOP_MS = SLOT_MS * SLOTS;
/** Within a slot: the reviewer signs, the packet leaves, the packet lands. */
const LEAVE_MS = 320;
const LAND_MS = 1150;
const RECEIPT_MS = 2300;
/** The title agent holds in this loop out of every three. */
const HOLD_LOOP = 2;
/** The frame shown when motion is reduced: all three signed, the last receipt showing. */
const STILL_MS = 2 * SLOT_MS + LAND_MS + 700;

/** Left to right on screen. */
const SEATS: readonly ReviewerRole[] = ["title", "survey", "septic"];
/** The order they sign in; title last, since title is the one that may hold. */
const ORDER: readonly ReviewerRole[] = ["survey", "septic", "title"];
const WALLETS = Object.fromEntries(
  stagedDeal.reviewers.map((reviewer) => [reviewer.role, shortAddress(reviewer.wallet)]),
) as Partial<Record<ReviewerRole, string>>;

const WHITE = "255,255,255";
const tone = (hex: string) =>
  rgb(hex)
    .map((channel) => Math.round(channel * 255))
    .join(",");
const GREEN = tone(PALETTE.green);
const RED = tone(PALETTE.red);
const GOLD = tone(PALETTE.gold);

interface Beat {
  signed: number;
  held: boolean;
  /** Who is signing right now. */
  signing: ReviewerRole | null;
  /** The receipt showing, if any. */
  receipt: { role: ReviewerRole; hold: boolean } | null;
}

/** What the diagram's words say at this moment. */
function beatAt(time: number): Beat {
  const loop = Math.floor(time / LOOP_MS);
  const inLoop = time - loop * LOOP_MS;
  const slot = Math.floor(inLoop / SLOT_MS);
  const inSlot = inLoop - slot * SLOT_MS;
  const holds = loop % 3 === HOLD_LOOP;
  const landed = Math.min(ORDER.length, slot + (inSlot >= LAND_MS ? 1 : 0));
  const held = holds && landed === ORDER.length;
  const role = ORDER[slot];
  // A receipt outlives its slot a little, into the next one.
  const since = inSlot >= LAND_MS ? inSlot - LAND_MS : inSlot + SLOT_MS - LAND_MS;
  const from = inSlot >= LAND_MS ? slot : slot - 1;
  const receiptRole = since < RECEIPT_MS ? ORDER[from] : undefined;
  return {
    signed: held ? ORDER.length - 1 : landed,
    held,
    signing: role && inSlot < LAND_MS ? role : null,
    receipt: receiptRole ? { role: receiptRole, hold: holds && receiptRole === "title" } : null,
  };
}

const sameBeat = (a: Beat, b: Beat) =>
  a.signed === b.signed &&
  a.held === b.held &&
  a.signing === b.signing &&
  a.receipt?.role === b.receipt?.role &&
  a.receipt?.hold === b.receipt?.hold;

/** The reviewers' diagram. Decorative: the section beside it describes it in words. */
export function ReviewerChain({ still }: { still: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const receipt = useRef<HTMLParagraphElement>(null);
  const seats = useRef<Partial<Record<ReviewerRole, HTMLLIElement | null>>>({});
  const hidden = usePageHidden();
  /** Running time, kept across pauses so the loop picks up where it stopped. */
  const clock = useRef(0);
  const [beat, setBeat] = useState<Beat>(() => beatAt(still ? STILL_MS : 0));
  const shown = still ? beatAt(STILL_MS) : beat;

  useEffect(() => {
    const frame = scene.current;
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!frame || !surface || !context) return;

    let width = 0;
    let height = 0;
    /** Where each reviewer's wallet sits, for the packets to leave from. */
    const origins: Partial<Record<ReviewerRole, { x: number; y: number }>> = {};

    const draw = (time: number) => {
      if (width < 1) return;
      const size = Math.min(104, Math.max(44, width * 0.135));
      const gap = size * 1.5;
      const speed = gap / SLOT_MS;
      const headX = width * 0.8;
      const chainY = height * 0.61;
      const corners = cubeCorners(size);
      const index = Math.floor(time / SLOT_MS);
      const xOf = (block: number) => headX - (time - block * SLOT_MS) * speed;
      /** Blocks fade as they leave on the left. */
      const edge = (x: number) => clamp01((x + size * 0.2) / (width * 0.2));

      context.clearRect(0, 0, width, height);
      context.lineCap = "round";

      // Where the next block will form: a faint outline just ahead of the chain.
      const ahead = clamp01((time - index * SLOT_MS) / SLOT_MS);
      drawBox(
        context,
        corners.map((corner) => ({ x: headX + gap * (1 - ahead) + corner.x * 0.86, y: chainY + corner.y * 0.86 })),
        `rgba(${WHITE},${0.1 * edge(headX)})`,
        `rgba(${WHITE},0.16)`,
        1,
        0,
      );

      // Links, under the blocks.
      context.lineWidth = 1;
      for (let block = index; xOf(block - 1) > -gap; block--) {
        const from = xOf(block - 1) + size * 0.46;
        const drawn = easeOut((time - block * SLOT_MS) / 420);
        const to = from + (xOf(block) - size * 0.46 - from) * drawn;
        context.strokeStyle = `rgba(${WHITE},${0.22 * edge(xOf(block - 1))})`;
        context.beginPath();
        context.moveTo(from, chainY);
        context.lineTo(to, chainY);
        context.stroke();
      }

      for (let block = index; xOf(block) > -size; block--) {
        const loop = Math.floor(block / SLOTS);
        const slot = block - loop * SLOTS;
        const age = time - block * SLOT_MS;
        const role = ORDER[slot];
        const hold = role === "title" && loop % 3 === HOLD_LOOP;
        const lit = role ? clamp01((age - LAND_MS) / 260) : 0;
        const flash = role ? Math.max(0, 1 - Math.max(0, age - LAND_MS) / 900) * (age >= LAND_MS ? 1 : 0) : 0;
        const arrive = easeOut(age / 420);
        const x = xOf(block);
        const fade = edge(x) * arrive;
        const color = lit > 0 ? (hold ? RED : GREEN) : WHITE;
        const alpha = (lit > 0 ? 0.6 + 0.35 * flash : 0.34) * fade;
        const scale = 0.86 + 0.14 * arrive;
        drawBox(
          context,
          corners.map((corner) => ({ x: x + corner.x * scale, y: chainY + corner.y * scale })),
          `rgba(${color},${alpha})`,
          `rgba(${color},${Math.min(1, alpha + 0.25)})`,
          lit > 0 ? 1.3 : 1,
          lit > 0 ? 6 + 12 * flash : 0,
        );
        if (lit > 0) {
          // The mark inside a signed block.
          const reach = size * 0.11;
          context.strokeStyle = `rgba(${color},${0.95 * fade * lit})`;
          context.lineWidth = 1.6;
          context.beginPath();
          if (hold) {
            context.moveTo(x - reach, chainY - reach);
            context.lineTo(x + reach, chainY + reach);
            context.moveTo(x + reach, chainY - reach);
            context.lineTo(x - reach, chainY + reach);
          } else {
            context.moveTo(x - reach * 1.2, chainY);
            context.lineTo(x - reach * 0.2, chainY + reach);
            context.lineTo(x + reach * 1.3, chainY - reach);
          }
          context.stroke();
        }
      }

      // The packet on its way down from a wallet to the newest block.
      const slot = index % SLOTS;
      const role = ORDER[slot];
      const origin = role ? origins[role] : undefined;
      const inSlot = time - index * SLOT_MS;
      if (role && origin && inSlot >= LEAVE_MS && inSlot <= LAND_MS + 120) {
        const hold = role === "title" && Math.floor(index / SLOTS) % 3 === HOLD_LOOP;
        const color = hold ? RED : GOLD;
        const landX = headX - LAND_MS * speed;
        const at = (t: number) => {
          const eased = easeInOut(clamp01(t));
          // Out sideways first, then down: a quadratic curve through a point level with the wallet.
          const bendX = landX;
          const bendY = origin.y + (chainY - origin.y) * 0.18;
          const a = (1 - eased) * (1 - eased);
          const b = 2 * (1 - eased) * eased;
          const c = eased * eased;
          return { x: a * origin.x + b * bendX + c * landX, y: a * origin.y + b * bendY + c * chainY };
        };
        const t = (inSlot - LEAVE_MS) / (LAND_MS - LEAVE_MS);
        const fade = 1 - clamp01((inSlot - LAND_MS) / 120);
        context.lineWidth = 1.4;
        for (let step = 0; step < 14; step++) {
          const from = at(t - step * 0.022);
          const to = at(t - (step + 1) * 0.022);
          context.strokeStyle = `rgba(${color},${0.6 * (1 - step / 14) * fade})`;
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        }
        const head = at(t);
        context.fillStyle = `rgba(${color},${fade})`;
        context.shadowColor = `rgba(${color},0.9)`;
        context.shadowBlur = 10;
        context.beginPath();
        context.arc(head.x, head.y, 3, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      }

      // The receipt rides under the block it belongs to.
      const chip = receipt.current;
      if (chip) {
        const since = inSlot >= LAND_MS ? inSlot - LAND_MS : inSlot + SLOT_MS - LAND_MS;
        const block = inSlot >= LAND_MS ? index : index - 1;
        const visible = ORDER[((block % SLOTS) + SLOTS) % SLOTS] !== undefined && since < RECEIPT_MS;
        const chipWidth = chip.offsetWidth;
        const x = Math.min(width - chipWidth - 6, Math.max(6, xOf(block) - chipWidth / 2));
        const opacity = visible ? Math.min(1, since / 180) * Math.min(1, (RECEIPT_MS - since) / 400) : 0;
        chip.style.transform = `translate3d(${x.toFixed(1)}px, ${(chainY + size * 0.66).toFixed(1)}px, 0)`;
        chip.style.opacity = opacity.toFixed(3);
      }
    };

    const measure = () => {
      const box = frame.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (const role of SEATS) {
        const mark = seats.current[role]?.querySelector(".rv-avatar");
        if (!mark) continue;
        const at = mark.getBoundingClientRect();
        origins[role] = { x: at.left + at.width / 2 - box.left, y: at.bottom - box.top + 2 };
      }
      if (still) draw(STILL_MS);
    };
    measure();
    const resizer = new ResizeObserver(measure);
    resizer.observe(frame);

    if (still || hidden) {
      return () => resizer.disconnect();
    }

    let visible = false;
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
    });
    watcher.observe(frame);

    // The clock only runs while the diagram is on screen, so it never jumps.
    let id = 0;
    let last: number | null = null;
    let time = clock.current;
    let current = beatAt(time);
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (!visible) {
        last = null;
        return;
      }
      time += last === null ? 0 : Math.min(64, now - last);
      last = now;
      clock.current = time;
      draw(time);
      const next = beatAt(time);
      if (!sameBeat(next, current)) {
        current = next;
        setBeat(next);
      }
    };
    id = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(id);
      watcher.disconnect();
      resizer.disconnect();
    };
  }, [still, hidden]);

  const state = shown.held ? "held" : shown.signed === ORDER.length ? "ready" : "waiting";
  const signedRoles = new Set(ORDER.slice(0, shown.signed));

  return (
    <div ref={scene} className="rv-scene" aria-hidden="true">
      <canvas ref={canvas} />
      <ul className="rv-seats">
        {SEATS.map((role) => (
          <li
            key={role}
            ref={(node) => {
              seats.current[role] = node;
            }}
            data-signing={shown.signing === role || undefined}
            data-state={
              shown.held && role === "title" ? "held" : signedRoles.has(role) ? "signed" : "waiting"
            }
          >
            <span className="rv-avatar">
              <WalletMark />
            </span>
            <span className="rv-role">{REVIEWERS.roles[role]}</span>
            <span className="rv-wallet mono">{WALLETS[role]}</span>
          </li>
        ))}
      </ul>
      <p ref={receipt} className="rv-receipt mono" data-hold={shown.receipt?.hold || undefined}>
        {shown.receipt && (
          <>
            {shown.receipt.hold ? REVIEWERS.verbs.hold : REVIEWERS.verbs.approve} · {shown.receipt.role} ·{" "}
            {WALLETS[shown.receipt.role]} <span className="rv-receipt-mark">{shown.receipt.hold ? "✕" : "✓"}</span>
          </>
        )}
      </p>
      <div className="rv-escrow" data-state={state}>
        <span className="rv-escrow-mark">{shown.held ? <LockMark /> : <Icon name="escrow" />}</span>
        <span className="rv-escrow-name">{REVIEWERS.escrow}</span>
        <span className="rv-pips">
          {ORDER.map((role, index) => (
            <i key={role} data-on={index < shown.signed || undefined} />
          ))}
        </span>
        <span className="rv-count">
          <span className="mono">
            {shown.signed}/{ORDER.length}
          </span>
          <span className="rv-count-word"> {REVIEWERS.signOffs}</span>
        </span>
        <span className="rv-escrow-state">
          {state === "held" ? REVIEWERS.held : state === "ready" ? REVIEWERS.ready : REVIEWERS.waiting}
        </span>
      </div>
    </div>
  );
}
