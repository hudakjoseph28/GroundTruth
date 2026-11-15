import { StatusPill } from "../../components/StatusPill";
import { CHECK_TITLES, LEDGER } from "../../content/parcel";
import { shortAddress, type LedgerRecord } from "../../data/ledger";
import { STATUS_LABELS } from "../../labels";
import { CopyButton } from "./CopyButton";
import { ProgressTrack } from "./ProgressTrack";

/** One check as a record on the chain of cards. The whole card opens its details. */
export function RecordCard({
  record,
  biggest,
  onOpen,
}: {
  record: LedgerRecord;
  biggest: boolean;
  onOpen: () => void;
}) {
  const { check, signerWallet, signature, role } = record;

  return (
    <li className="record" data-status={check.status}>
      <div className="record-card">
        <div className="record-head">
          <h3>
            <button type="button" className="record-open" aria-haspopup="dialog" onClick={onOpen}>
              {CHECK_TITLES[check.kind]}
              <span className="visually-hidden">
                : {STATUS_LABELS[check.status]}. {LEDGER.details}
              </span>
            </button>
          </h3>
          <StatusPill status={check.status} />
        </div>
        {biggest && <p className="record-flag">{LEDGER.biggest}</p>}
        <p className="record-signer">
          <span className="record-label">{role ? LEDGER.signs : LEDGER.confirms}</span>{" "}
          {check.responsibleParty.role}
          {signerWallet && (
            <>
              {" "}
              <span className="mono" title={signerWallet}>
                {shortAddress(signerWallet)}
              </span>
            </>
          )}
        </p>
        <div className="record-foot">
          <ProgressTrack steps={record.steps} />
          {signature ? (
            <p className="record-address">
              <span className="mono" title={signature}>
                {shortAddress(signature)}
              </span>
              <CopyButton value={signature} label={LEDGER.copy} />
            </p>
          ) : (
            <p className="record-address record-address-none">{LEDGER.notOnChain}</p>
          )}
        </div>
      </div>
    </li>
  );
}
