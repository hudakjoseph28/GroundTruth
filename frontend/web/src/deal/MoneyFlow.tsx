import type { DealState } from "@groundtruth/shared";
import { MONEY_FLOW } from "../content/deal";

type MoneyLocation = "buyer" | "vault" | "seller";

const LOCATION_BY_STATE: Record<DealState, MoneyLocation> = {
  draft: "buyer",
  funded: "vault",
  held: "vault",
  released: "seller",
  refunded: "buyer",
};

export function moneyLocation(state: DealState): MoneyLocation {
  return LOCATION_BY_STATE[state];
}

/** The confirmed location of this deal's test USDC, from buyer to settlement. */
export function MoneyFlow({
  amount,
  state,
  live,
}: {
  amount: string;
  state: DealState;
  /** The confirmed state changed while this page was open. */
  live: boolean;
}) {
  const location = moneyLocation(state);
  const held = state === "held";
  const statement = MONEY_FLOW.statement[state](amount);

  return (
    <section
      className="money-flow"
      data-location={location}
      data-state={state}
      aria-labelledby="money-flow-title"
    >
      <header className="money-flow-head">
        <div>
          <p className="eyebrow">{MONEY_FLOW.eyebrow}</p>
          <h2 id="money-flow-title">{MONEY_FLOW.title}</h2>
        </div>
        <p className="money-flow-statement" aria-live="polite">
          {statement}
        </p>
      </header>

      <div className="money-flow-track">
        <FlowStop
          name={MONEY_FLOW.buyer}
          detail={MONEY_FLOW.buyerDetail}
          active={location === "buyer"}
        />
        <FlowArrow />
        <FlowStop
          name={MONEY_FLOW.vault}
          detail={held ? MONEY_FLOW.locked : MONEY_FLOW.vaultDetail}
          active={location === "vault"}
          locked={held}
        />
        <FlowArrow />
        <FlowStop
          name={MONEY_FLOW.seller}
          detail={MONEY_FLOW.sellerDetail}
          active={location === "seller"}
        />

        <div
          className="money-flow-token"
          key={state}
          data-live={live}
          data-locked={held}
          aria-hidden="true"
        >
          {held ? <LockIcon /> : null}
          <strong className="mono">{amount}</strong>
          <span>{MONEY_FLOW.unit}</span>
        </div>
      </div>
    </section>
  );
}

function FlowStop({
  name,
  detail,
  active,
  locked = false,
}: {
  name: string;
  detail: string;
  active: boolean;
  locked?: boolean;
}) {
  return (
    <div
      className="money-flow-stop"
      data-active={active}
      data-locked={locked}
      aria-current={active ? "location" : undefined}
    >
      <span className="money-flow-stop-icon" aria-hidden="true">
        {locked ? <LockIcon /> : <span />}
      </span>
      <strong>{name}</strong>
      <span>{detail}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <span className="money-flow-arrow" aria-hidden="true">
      <span />
      <svg viewBox="0 0 12 12">
        <path d="m3 2 4 4-4 4" />
      </svg>
    </span>
  );
}

function LockIcon() {
  return (
    <svg className="money-flow-lock" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" />
      <rect x="2.5" y="7" width="11" height="7" rx="2" />
      <path d="M8 10v1.5" />
    </svg>
  );
}
