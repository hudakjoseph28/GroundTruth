import { useState } from "react";
import { SEATS, type SeatId } from "../content/home";
import { BLOCK, BLOCK_EDGES, Icon } from "./icons";
import { Reveal } from "./Reveal";

/** Buyer, seller, reviewer: three cards, each tied to the one deal between them. */
export function Seats() {
  const [lit, setLit] = useState<SeatId | null>(null);

  return (
    <Reveal className="section seats">
      <section aria-labelledby="seats-title">
        <p className="eyebrow">{SEATS.eyebrow}</p>
        <h2 id="seats-title">{SEATS.title}</h2>

        <div className="seats-table" data-lit={lit ?? undefined}>
          <div className="seats-deal">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d={BLOCK} />
              <path d={BLOCK_EDGES} />
            </svg>
            <p>
              <strong>{SEATS.deal.title}</strong>
              <span>{SEATS.deal.line}</span>
            </p>
          </div>
          <svg className="seats-fan" viewBox="0 0 600 64" preserveAspectRatio="none" aria-hidden="true">
            <path data-seat="buyer" d="M300 0C300 40 100 20 100 64" />
            <path data-seat="seller" d="M300 0V64" />
            <path data-seat="reviewer" d="M300 0C300 40 500 20 500 64" />
          </svg>
          <ul className="seats-cards">
            {SEATS.cards.map((seat) => (
              <li
                key={seat.id}
                className="seat"
                data-seat={seat.id}
                onPointerEnter={() => setLit(seat.id)}
                onPointerLeave={() => setLit(null)}
              >
                <div className="seat-art" aria-hidden="true">
                  <SeatArt seat={seat.id} />
                </div>
                <h3>
                  <Icon name={seat.id} />
                  {seat.title}
                </h3>
                <p>{seat.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Reveal>
  );
}

/** Each seat's small moving picture. The card's sentence says the same thing. */
function SeatArt({ seat }: { seat: SeatId }) {
  if (seat === "buyer") {
    // Coins run into the escrow block and it locks.
    return (
      <svg viewBox="0 0 200 64">
        <path className="art-rail" d="M24 32H118" />
        <circle className="art-end" cx="20" cy="32" r="5" />
        <circle className="art-coin" cx="24" cy="32" r="3" />
        <circle className="art-coin" cx="24" cy="32" r="3" />
        <circle className="art-coin" cx="24" cy="32" r="3" />
        <g transform="translate(118 8) scale(3)">
          <path className="art-block" d={BLOCK} />
        </g>
        <g transform="translate(133 21)">
          <g className="art-lock">
            <rect x="1.5" y="8" width="15" height="11" rx="2" />
            <path d="M5 8V5.5a4 4 0 0 1 8 0V8" />
          </g>
        </g>
      </svg>
    );
  }
  if (seat === "seller") {
    // Three sign-offs turn green, then the payout line runs to the seller.
    return (
      <svg viewBox="0 0 200 64">
        <circle className="art-seal" cx="26" cy="32" r="5" />
        <circle className="art-seal" cx="44" cy="32" r="5" />
        <circle className="art-seal" cx="62" cy="32" r="5" />
        <path className="art-rail" d="M76 32H168" />
        <path className="art-pay" d="M76 32H168" pathLength="1" />
        <circle className="art-payee" cx="176" cy="32" r="7" />
        <path className="art-paid" d="M172.4 32.2l2.6 2.6 4.6-5.2" />
      </svg>
    );
  }
  // A signature is drawn, then drops into a block, which lights.
  return (
    <svg viewBox="0 0 200 64">
      <path
        className="art-sign"
        pathLength="1"
        d="M22 36c8-16 14-18 16-10s-8 16-4 16 10-22 16-20-2 18 4 18 8-12 14-12 4 8 10 8"
      />
      <circle className="art-drop" cx="86" cy="36" r="3" />
      <g transform="translate(136 8) scale(3)">
        <path className="art-block art-block-lit" d={BLOCK} />
        <path className="art-tick" d="M5.2 8.2 7.2 10.2 10.9 6" />
      </g>
    </svg>
  );
}
