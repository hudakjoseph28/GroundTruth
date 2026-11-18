import { useLayoutEffect, useRef, type MouseEvent } from "react";
import { StatusPill } from "../../components/StatusPill";
import { CHECK_TITLES, INSPECTOR, LEDGER } from "../../content/parcel";
import { explorerTxUrl, shortAddress, type LedgerRecord } from "../../data/ledger";
import { ApprovalAnimation, type Outcome } from "./ApprovalAnimation";

const date = (iso: string) => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
};

const outcomeOf = (record: LedgerRecord): Outcome =>
  record.check.status === "signedOff" ? "signedOff" : record.check.status === "held" ? "held" : "pending";

/** A point on screen, in viewport pixels. */
export interface Origin {
  x: number;
  y: number;
}

/**
 * The details behind one record, in a drawer that grows out of the record's
 * node on the chain, like zooming into that block. A native modal dialog: focus
 * stays inside, Esc closes it, and focus returns to the card that opened it.
 */
export function Inspector({
  record,
  origin,
  onClose,
}: {
  record: LedgerRecord | null;
  /** Where the record's node sits; the drawer opens from there. */
  origin: Origin | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (record && !node.open) {
      node.showModal();
      // offsetLeft/Top are the laid-out position, unaffected by the opening scale.
      node.style.transformOrigin = origin
        ? `${origin.x - node.offsetLeft}px ${origin.y - node.offsetTop}px`
        : "";
    }
    if (!record && node.open) node.close();
  }, [record, origin]);

  // A click on the backdrop lands on the dialog itself, not on its contents.
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="inspector"
      aria-labelledby="inspector-title"
      onClose={onClose}
      onClick={onBackdrop}
    >
      {/* Mounted fresh on every open, so the animation replays. */}
      {record && <InspectorBody record={record} onClose={onClose} />}
    </dialog>
  );
}

function InspectorBody({ record, onClose }: { record: LedgerRecord; onClose: () => void }) {
  const { check, signature, signerWallet } = record;
  const party = check.responsibleParty;

  return (
    <div className="inspector-body">
      <header className="inspector-head">
        <div>
          {record.staged && <p className="tag">{LEDGER.stagedTag}</p>}
          <h2 id="inspector-title">{CHECK_TITLES[check.kind]}</h2>
          <StatusPill status={check.status} label={record.statusLabel} />
        </div>
        <button type="button" className="inspector-close" onClick={onClose} autoFocus>
          {INSPECTOR.close}
        </button>
      </header>

      {/* Only a deal's reviewers sign into an escrow. A flood map or a utility
          record has no wallet and no chain step, so it gets no diagram. */}
      {(record.onDeal || signature) && (
        <ApprovalAnimation
          outcome={outcomeOf(record)}
          from={signerWallet ? shortAddress(signerWallet) : INSPECTOR.party}
          confirmed={Boolean(signature)}
        />
      )}

      <dl className="inspector-facts">
        <div>
          <dt>{INSPECTOR.finding}</dt>
          <dd>{check.finding}</dd>
        </div>
        <div>
          <dt>{INSPECTOR.limitation}</dt>
          <dd>{check.limitation}</dd>
        </div>
        {check.sources.length > 0 && (
          <div>
            <dt>{INSPECTOR.sources}</dt>
            <dd>
              <ul className="inspector-links">
                {check.sources.map((source) => (
                  <li key={source.url + source.title}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.authority}: {source.title}
                    </a>
                    <span>
                      {INSPECTOR.retrieved} {date(source.retrievedAt)}
                      {source.effectiveDate && ` · ${INSPECTOR.effective} ${date(source.effectiveDate)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {record.references.length > 0 && (
          <div>
            <dt>{INSPECTOR.references}</dt>
            <dd>
              <ul className="inspector-links">
                {record.references.map((reference) => (
                  <li key={reference.url}>
                    <a href={reference.url} target="_blank" rel="noreferrer">
                      {reference.authority}: {reference.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="inspector-note">{INSPECTOR.stagedExample}</p>
            </dd>
          </div>
        )}
        <div>
          <dt>{INSPECTOR.next}</dt>
          <dd>{check.nextAction}</dd>
        </div>
        <div>
          <dt>{INSPECTOR.who}</dt>
          <dd>
            {party.publicContactUrl ? (
              <a href={party.publicContactUrl} target="_blank" rel="noreferrer">
                {party.role}
              </a>
            ) : (
              party.role
            )}
            {party.organization && `, ${party.organization}`}
            {signerWallet && (
              <span className="mono inspector-wallet" title={signerWallet}>
                {signerWallet}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {(record.onDeal || signature) && (
        <footer className="inspector-foot">
          {signature ? (
            <a className="inspector-explorer" href={explorerTxUrl(signature)} target="_blank" rel="noreferrer">
              {INSPECTOR.explorer} <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p>{INSPECTOR.unsigned}</p>
          )}
        </footer>
      )}
    </div>
  );
}
