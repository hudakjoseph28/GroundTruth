import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HOLD_REASON_CODES,
  placeHoldInstruction,
  releaseInstruction,
  signApprovalInstruction,
  type Deal,
  type EscrowInstructionSpec,
  type HoldReasonCode,
  type ReviewerRole,
} from "@groundtruth/shared";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { PhantomWalletName } from "@solana/wallet-adapter-phantom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { HOLD_REASONS, ROLE_LABELS, STATE_LABELS } from "../content/deal";
import { REVIEW } from "../content/review";
import { dealPath } from "../data/dealSource";
import { viewDeal } from "../data/dealView";
import { usePageTitle } from "../layout/usePageTitle";
import {
  explainFailure,
  explorerTx,
  signAndSend,
  vaultFor,
  waitForConfirmation,
  type SendPhase,
} from "./escrowTx";
import { useReviewerDeals } from "./useReviewerDeals";
import { WalletRoot } from "./WalletRoot";
import "./review.css";

const short = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

/** `/review`: a reviewer signs their decision on a staged deal with their own wallet. */
export default function ReviewPage() {
  usePageTitle(REVIEW.title);
  return (
    <WalletRoot>
      <Portal />
    </WalletRoot>
  );
}

function Portal() {
  const { publicKey } = useWallet();
  const me = publicKey?.toBase58() ?? null;
  const { state, refresh } = useReviewerDeals(me);

  return (
    <div className="review">
      <header className="review-head">
        <p className="review-devnet">{REVIEW.devnet}</p>
        <h1>{REVIEW.title}</h1>
        <p className="review-intro">{REVIEW.intro}</p>
        <WalletBar />
      </header>
      {me &&
        (state.status === "loading" || state.status === "idle" ? (
          <p className="notice" role="status">
            {REVIEW.loading}
          </p>
        ) : state.status === "error" ? (
          <div className="notice notice-error" role="alert">
            <p>{REVIEW.loadError}</p>
            <button type="button" className="btn btn-small" onClick={refresh}>
              {REVIEW.retry}
            </button>
          </div>
        ) : state.deals.length === 0 ? (
          <p className="notice" role="status">
            {REVIEW.none}
          </p>
        ) : (
          <ul className="review-deals">
            {state.deals.map((deal) => (
              <li key={deal.id}>
                <DealCard deal={deal} me={me} onDone={refresh} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function WalletBar() {
  const { wallets, wallet, publicKey, connecting, select, connect, disconnect } = useWallet();
  const phantom = wallets.find((w) => w.adapter.name === PhantomWalletName);
  const detected =
    phantom?.readyState === WalletReadyState.Installed ||
    phantom?.readyState === WalletReadyState.Loadable;

  if (publicKey) {
    return (
      <div className="review-wallet">
        <span>{REVIEW.connectedAs(short(publicKey.toBase58()))}</span>
        <button type="button" className="btn btn-small" onClick={() => void disconnect()}>
          {REVIEW.disconnect}
        </button>
      </div>
    );
  }
  if (!detected) {
    const here = typeof window === "undefined" ? "" : window.location.href;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return (
      <div className="review-wallet review-wallet-missing">
        <p>{REVIEW.noPhantom}</p>
        <a
          className="btn"
          href={`https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(origin)}`}
        >
          {REVIEW.openInPhantom}
        </a>
      </div>
    );
  }
  return (
    <div className="review-wallet">
      <button
        type="button"
        className="btn btn-primary"
        disabled={connecting}
        onClick={() => {
          if (wallet?.adapter.name === PhantomWalletName) void connect().catch(() => {});
          else select(PhantomWalletName);
        }}
      >
        {connecting ? REVIEW.connecting : REVIEW.connect}
      </button>
      <p className="review-hint">{REVIEW.phantomNetwork}</p>
    </div>
  );
}

type ActionKind = "approve" | "hold" | "release";

type ActionState =
  | { phase: "idle" }
  | { phase: SendPhase; kind: ActionKind; signature?: string }
  | { phase: "confirmed"; kind: ActionKind; signature: string }
  | { phase: "failed"; kind: ActionKind; message: string; signature?: string };

/** Why `role` cannot approve now, or null when it can. */
function approveBlocker(deal: Deal, role: ReviewerRole, me: string): string | null {
  const mine = deal.reviewers.find((r) => r.wallet === me && r.role === role);
  if (!mine) return REVIEW.blocked.notReviewer;
  if (mine.approvedAt) return REVIEW.blocked.alreadySigned;
  // A refunded deal keeps its hold record; it is settled, not on hold.
  if (deal.state === "released" || deal.state === "refunded") {
    return REVIEW.blocked.settled;
  }
  if (deal.state === "held" || deal.hold) return REVIEW.blocked.held;
  if (deal.state === "draft") return REVIEW.blocked.notFunded;
  return null;
}

/** What this card itself confirmed on chain, until the API (via the Stream) catches up. */
interface Confirmed {
  approved: ReviewerRole[];
  hold?: { role: ReviewerRole; reasonCode: HoldReasonCode };
  released?: boolean;
}

/** The API's deal with this card's own confirmed actions applied. */
function withConfirmed(deal: Deal, mine: Confirmed, me: string): Deal {
  const now = new Date().toISOString();
  const reviewers = deal.reviewers.map((r) =>
    r.wallet === me && mine.approved.includes(r.role) && !r.approvedAt
      ? { ...r, approvedAt: now }
      : r,
  );
  if (mine.released && deal.state === "funded") {
    return { ...deal, reviewers, state: "released" };
  }
  if (mine.hold && !deal.hold && deal.state === "funded") {
    return {
      ...deal,
      reviewers,
      state: "held",
      hold: {
        placedByWallet: me,
        role: mine.hold.role,
        reasonCode: mine.hold.reasonCode,
        buyerMessage: "",
        transactionSignature: "",
        placedAt: now,
      },
    };
  }
  return { ...deal, reviewers };
}

function DealCard({ deal: fromApi, me, onDone }: { deal: Deal; me: string; onDone: () => void }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [mine, setMine] = useState<Confirmed>({ approved: [] });
  const deal = useMemo(() => withConfirmed(fromApi, mine, me), [fromApi, mine, me]);
  const view = viewDeal(deal);
  const myRoles = deal.reviewers.filter((r) => r.wallet === me).map((r) => r.role);
  const [action, setAction] = useState<ActionState>({ phase: "idle" });
  const [reason, setReason] = useState<HoldReasonCode>("SELLER_IDENTITY_DISPUTED");
  const [confirmHold, setConfirmHold] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const busy =
    action.phase === "checking" || action.phase === "signing" || action.phase === "sent";
  const open = deal.state === "funded" && !deal.hold;
  const allSigned = deal.reviewers.filter((r) => r.required).every((r) => r.approvedAt);
  const dealPda = deal.escrowAddress;

  const run = useCallback(
    async (kind: ActionKind, spec: EscrowInstructionSpec, onConfirmed: () => void) => {
      if (!publicKey || !signTransaction) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      let signature: string | undefined;
      try {
        signature = await signAndSend({
          connection,
          payer: publicKey,
          spec,
          signTransaction,
          onPhase: (phase) => setAction({ phase, kind }),
        });
        setAction({ phase: "sent", kind, signature });
        await waitForConfirmation(connection, signature, controller.signal);
        if (!controller.signal.aborted) {
          setAction({ phase: "confirmed", kind, signature });
          onConfirmed();
          onDone();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAction({ phase: "failed", kind, message: explainFailure(error), signature });
        }
      }
    },
    [connection, publicKey, signTransaction, onDone],
  );

  if (!dealPda) return null;

  return (
    <article className="review-deal" data-tone={view.tone}>
      <header className="review-deal-head">
        <p className="review-amount">{REVIEW.amount(view.amount)}</p>
        <span className="review-state" data-tone={view.tone}>
          {STATE_LABELS[deal.state]}
        </span>
      </header>
      <p className="review-meta">
        {REVIEW.parcel}{" "}
        <Link to={`/parcels/${encodeURIComponent(deal.parcelKey)}`}>{view.parcelId}</Link>
        <span className="review-dealid">{deal.id}</span>
      </p>
      <p className="review-roles">
        {REVIEW.yourRole(myRoles.map((r) => ROLE_LABELS[r]).join(", "))}
      </p>

      <ul className="review-signoffs" aria-label={REVIEW.signedBy}>
        {view.reviewers.map((r) => (
          <li key={r.role} data-status={r.status}>
            <span className="review-signoff-role">{ROLE_LABELS[r.role]}</span>
            <span className="review-signoff-status">
              {r.status === "signed" ? "Signed" : r.status === "held" ? "Hold placed" : r.status === "waiting" ? "Waiting" : "Not signed"}
            </span>
          </li>
        ))}
      </ul>
      {deal.hold && (
        <p className="review-hold">
          {HOLD_REASONS[deal.hold.reasonCode]} · {ROLE_LABELS[deal.hold.role]} reviewer
        </p>
      )}

      <div className="review-actions">
        {myRoles.map((role) => {
          const blocker = approveBlocker(deal, role, me);
          return blocker ? (
            <p key={role} className="review-blocked">
              {ROLE_LABELS[role]}: {blocker}
            </p>
          ) : (
            <button
              key={role}
              type="button"
              className="btn btn-primary review-btn"
              disabled={busy}
              onClick={() =>
                void run("approve", signApprovalInstruction({ reviewer: me, dealPda, role }), () =>
                  setMine((m) => ({ ...m, approved: [...m.approved, role] })),
                )
              }
            >
              {REVIEW.actions.approve(ROLE_LABELS[role].toLowerCase())}
            </button>
          );
        })}

        {open && myRoles[0] && (
          <div className="review-holdbox">
            <label>
              <span>{REVIEW.actions.holdReason}</span>
              <select
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value as HoldReasonCode)}
              >
                {HOLD_REASON_CODES.map((code) => (
                  <option key={code} value={code}>
                    {HOLD_REASONS[code]}
                  </option>
                ))}
              </select>
            </label>
            {confirmHold ? (
              <div className="review-confirm" role="group">
                <p>{REVIEW.actions.holdConfirm}</p>
                <button
                  type="button"
                  className="btn review-btn review-btn-danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmHold(false);
                    const role = myRoles[0]!;
                    const reasonCode = reason;
                    void run(
                      "hold",
                      placeHoldInstruction({ reviewer: me, dealPda, role, reasonCode }),
                      () => setMine((m) => ({ ...m, hold: { role, reasonCode } })),
                    );
                  }}
                >
                  {REVIEW.actions.holdYes}
                </button>
                <button type="button" className="btn btn-small" onClick={() => setConfirmHold(false)}>
                  {REVIEW.actions.holdNo}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn review-btn review-btn-danger"
                disabled={busy}
                onClick={() => setConfirmHold(true)}
              >
                {REVIEW.actions.hold}
              </button>
            )}
          </div>
        )}

        {open && allSigned && (
          <div className="review-release">
            <p>{REVIEW.actions.releaseNote}</p>
            <button
              type="button"
              className="btn btn-primary review-btn"
              disabled={busy}
              onClick={() =>
                void run(
                  "release",
                  releaseInstruction({
                    payer: me,
                    dealPda,
                    seller: deal.sellerWallet,
                    sellerTokenAccount: deal.sellerTokenAccount,
                    buyer: deal.buyerWallet,
                    vault: vaultFor(dealPda, deal.mint),
                    mint: deal.mint,
                  }),
                  () => setMine((m) => ({ ...m, released: true })),
                )
              }
            >
              {REVIEW.actions.release}
            </button>
          </div>
        )}
      </div>

      <ActionStatus action={action} />
      <Link className="review-open" to={dealPath(deal.id)}>
        {REVIEW.openDeal} →
      </Link>
    </article>
  );
}

function ActionStatus({ action }: { action: ActionState }) {
  if (action.phase === "idle") return null;
  const words =
    action.phase === "failed"
      ? `${REVIEW.status.failed} ${action.message}`
      : REVIEW.status[action.phase];
  const signature = "signature" in action ? action.signature : undefined;
  return (
    <div
      className="review-status"
      data-phase={action.phase}
      role={action.phase === "failed" ? "alert" : "status"}
      aria-live="polite"
    >
      <p>{words}</p>
      {signature && (
        <p className="review-sig">
          {REVIEW.status.signature} <code>{short(signature)}</code>{" "}
          <a href={explorerTx(signature)} target="_blank" rel="noreferrer">
            {REVIEW.status.viewTx}
          </a>
        </p>
      )}
    </div>
  );
}
