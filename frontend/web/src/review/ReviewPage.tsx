import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HOLD_REASON_CODES,
  documentMemoInstruction,
  placeHoldInstruction,
  releaseInstruction,
  signApprovalInstruction,
  type Deal,
  type EscrowInstructionSpec,
  type FeeSponsorStatus,
  type HoldReasonCode,
  type ReviewerRole,
  type SponsoredTransactionRequest,
  showsReviewerCredentials,
} from "@groundtruth/shared";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { CredentialBadge } from "../credential/CredentialBadge";
import { useReviewerCredentials } from "../credential/useReviewerCredentials";
import { HOLD_REASONS, ROLE_LABELS, STATE_LABELS } from "../content/deal";
import { APPROVE_WITH_DOCUMENT, DOCUMENT_TYPE_LABELS, PARCEL_CHECK } from "../content/documents";
import { DealDocuments } from "../documents/DealDocuments";
import { FindingsButton, useDocumentFindings } from "../documents/DocumentFindings";
import { mismatchedDocuments } from "../documents/ParcelCheckNote";
import { OpenFileButton, ParticipantPanel } from "../documents/ParticipantTools";
import { useDealDocuments } from "../documents/useDealDocuments";
import { REVIEW } from "../content/review";
import { dealPath } from "../data/dealSource";
import { viewDeal } from "../data/dealView";
import { usePageTitle } from "../layout/usePageTitle";
import {
  SentActionError,
  explainFailure,
  explorerTx,
  sendAndConfirm,
  vaultFor,
  type FeePaidBy,
  type SendPhase,
} from "./escrowTx";
import { sponsorFor, useFeeSponsor } from "./feeSponsor";
import { useReviewerDeals } from "./useReviewerDeals";
import { WalletBar } from "./WalletBar";
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
  const feeSponsor = useFeeSponsor();

  return (
    <div className="review">
      <header className="review-head">
        <p className="eyebrow">{REVIEW.devnet}</p>
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
                <DealCard deal={deal} me={me} onDone={refresh} feeSponsor={feeSponsor} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

type ActionKind = "approve" | "hold" | "release";

type ActionState = (
  | { phase: "idle" }
  | { phase: SendPhase; kind: ActionKind; signature?: string; attempt: number; of: number }
  | { phase: "confirmed"; kind: ActionKind; signature: string }
  | { phase: "failed"; kind: ActionKind; message: string; signature?: string }
) & {
  /** Who pays the fee for the transaction in flight; set once known. */
  paidBy?: FeePaidBy;
  /** True when GroundTruth was asked to cover the fee for this action. */
  offered?: boolean;
};

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

function DealCard({
  deal: fromApi,
  me,
  onDone,
  feeSponsor,
}: {
  deal: Deal;
  me: string;
  onDone: () => void;
  feeSponsor: FeeSponsorStatus;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [mine, setMine] = useState<Confirmed>({ approved: [] });
  const deal = useMemo(() => withConfirmed(fromApi, mine, me), [fromApi, mine, me]);
  const view = viewDeal(deal);
  // Staged SAS credentials, read from devnet in the browser: rehearsal deals only.
  const credentials = useReviewerCredentials(deal.reviewers, showsReviewerCredentials(deal.id));
  const myRoles = deal.reviewers.filter((r) => r.wallet === me).map((r) => r.role);
  const [action, setAction] = useState<ActionState>({ phase: "idle" });
  const [reason, setReason] = useState<HoldReasonCode>("SELLER_IDENTITY_DISPUTED");
  const [confirmHold, setConfirmHold] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const documents = useDealDocuments(deal.id);
  const docs = documents.state.status === "ready" ? documents.state.documents : [];
  const findings = useDocumentFindings(deal);
  const mismatched = mismatchedDocuments(docs, findings.byId);
  /** Per role: the SHA-256 of the document an approval relies on, or "". */
  const [relyOn, setRelyOn] = useState<Partial<Record<ReviewerRole, string>>>({});

  const busy =
    action.phase === "checking" ||
    action.phase === "signing" ||
    action.phase === "sent" ||
    action.phase === "retrying";
  const open = deal.state === "funded" && !deal.hold;
  const allSigned = deal.reviewers.filter((r) => r.required).every((r) => r.approvedAt);
  const dealPda = deal.escrowAddress;

  const run = useCallback(
    async (
      kind: ActionKind,
      spec: EscrowInstructionSpec,
      onConfirmed: () => void,
      extra: EscrowInstructionSpec[],
      sponsorBody: SponsoredTransactionRequest,
    ) => {
      if (!publicKey || !signTransaction || !dealPda) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const sponsor = sponsorFor(feeSponsor, fromApi.id, dealPda, sponsorBody);
      const offered = Boolean(sponsor);
      let paidBy: FeePaidBy | undefined;
      try {
        const signature = await sendAndConfirm({
          connection,
          payer: publicKey,
          spec,
          extra,
          signTransaction,
          sponsor,
          signal: controller.signal,
          onFeePaidBy: (who) => {
            paidBy = who;
          },
          onProgress: (progress) => {
            if (!controller.signal.aborted) {
              setAction({ ...progress, kind, paidBy, offered });
            }
          },
        });
        if (!controller.signal.aborted) {
          setAction({ phase: "confirmed", kind, signature, paidBy, offered });
          onConfirmed();
          onDone();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAction({
            phase: "failed",
            kind,
            message: explainFailure(error),
            signature: error instanceof SentActionError ? error.signature : undefined,
            paidBy,
            offered,
          });
        }
      }
    },
    [connection, publicKey, signTransaction, onDone, feeSponsor, fromApi.id, dealPda],
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
            {credentials && <CredentialBadge reads={credentials} wallet={r.wallet} role={r.role} />}
          </li>
        ))}
      </ul>
      {deal.hold && (
        <p className="review-hold">
          {HOLD_REASONS[deal.hold.reasonCode]} · {ROLE_LABELS[deal.hold.role]} reviewer
        </p>
      )}

      {open && feeSponsor.enabled && (
        <p className="review-fee" title={REVIEW.fee.sponsoredNote}>
          {REVIEW.fee.sponsored}
          <small>{REVIEW.fee.sponsoredNote}</small>
        </p>
      )}
      {mismatched.length > 0 && (
        <div className="review-parcel-warning" role="alert">
          <p>
            <strong>{PARCEL_CHECK.review.warning(mismatched.length)}</strong>
          </p>
          <ul>
            {mismatched.map((doc) => {
              const found = findings.byId?.get(doc.id)?.found?.parcelId;
              return (
                <li key={doc.id}>
                  {DOCUMENT_TYPE_LABELS[doc.type]} · {doc.filename}
                  {found ? ` · ${PARCEL_CHECK.differentId(found)}` : ""}
                </li>
              );
            })}
          </ul>
          <p className="review-parcel-advisory">{PARCEL_CHECK.review.advisory}</p>
          <FindingsButton findings={findings} />
        </div>
      )}

      <div className="review-actions">
        {myRoles.map((role) => {
          const blocker = approveBlocker(deal, role, me);
          if (blocker) {
            return (
              <p key={role} className="review-blocked">
                {ROLE_LABELS[role]}: {blocker}
              </p>
            );
          }
          const chosen = docs.find((doc) => doc.sha256 === relyOn[role]);
          return (
            <div key={role} className="review-approve">
              {docs.length > 0 && (
                <label className="review-relyon">
                  <span>{APPROVE_WITH_DOCUMENT.label}</span>
                  <select
                    value={chosen?.sha256 ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      setRelyOn((current) => ({ ...current, [role]: event.target.value }))
                    }
                  >
                    <option value="">{APPROVE_WITH_DOCUMENT.none}</option>
                    {docs.map((doc) => (
                      <option key={doc.id} value={doc.sha256}>
                        {DOCUMENT_TYPE_LABELS[doc.type]} · {doc.filename}
                      </option>
                    ))}
                  </select>
                  {chosen && <small>{APPROVE_WITH_DOCUMENT.note}</small>}
                  {chosen && mismatched.includes(chosen) && (
                    <small className="review-relyon-warning" role="alert">
                      {PARCEL_CHECK.review.chosen}
                    </small>
                  )}
                </label>
              )}
              <button
                type="button"
                className="btn btn-primary review-btn"
                disabled={busy}
                onClick={() =>
                  void run(
                    "approve",
                    signApprovalInstruction({ reviewer: me, dealPda, role }),
                    () => setMine((m) => ({ ...m, approved: [...m.approved, role] })),
                    chosen ? [documentMemoInstruction({ signer: me, sha256: chosen.sha256 })] : [],
                    {
                      action: "sign_approval",
                      account: me,
                      role,
                      ...(chosen ? { documentSha256: chosen.sha256 } : {}),
                    },
                  )
                }
              >
                {REVIEW.actions.approve(ROLE_LABELS[role].toLowerCase())}
              </button>
            </div>
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
                      [],
                      { action: "place_hold", account: me, role, reasonCode },
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
                  [],
                  { action: "release", account: me },
                )
              }
            >
              {REVIEW.actions.release}
            </button>
          </div>
        )}
      </div>

      <ActionStatus action={action} />
      <DealDocuments
        compact
        state={documents.state}
        timeline={deal.timeline}
        findings={findings.byId}
        fileAction={(doc) => <OpenFileButton deal={deal} doc={doc} />}
        participant={
          <>
            {mismatched.length === 0 && <FindingsButton findings={findings} />}
            <ParticipantPanel deal={deal} onUploaded={documents.refresh} />
          </>
        }
      />
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
      : action.phase === "retrying"
        ? REVIEW.status.retrying(action.attempt, action.of)
        : action.phase === "sent" && action.attempt > 1
          ? `${REVIEW.status.sent} ${REVIEW.status.attempt(action.attempt, action.of)}`
          : REVIEW.status[action.phase];
  // While retrying, the shown signature expired and never landed; hide it.
  const signature =
    action.phase !== "retrying" && "signature" in action ? action.signature : undefined;
  return (
    <div
      className="review-status"
      data-phase={action.phase}
      role={action.phase === "failed" ? "alert" : "status"}
      aria-live="polite"
    >
      <p>{words}</p>
      {action.paidBy === "groundtruth" ? (
        <p className="review-fee-line">{REVIEW.fee.sponsored}</p>
      ) : action.paidBy === "wallet" && action.offered ? (
        <p className="review-fee-line">{REVIEW.fee.fellBack}</p>
      ) : null}
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
