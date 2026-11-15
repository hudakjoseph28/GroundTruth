import type { CSSProperties } from "react";
import { StatusPill } from "../../components/StatusPill";
import { CHECK_TITLES, LEDGER } from "../../content/parcel";
import { shortAddress, type LedgerRecord } from "../../data/ledger";
import { STATUS_LABELS } from "../../labels";
import { CopyButton } from "./CopyButton";
import { ProgressTrack } from "./ProgressTrack";
import { RecordNode } from "./RecordNode";

/** One check as a record on the chain of cards. The whole card opens its details. */
export function RecordCard({
  record,
  index,
  last,
  biggest,
  open,
  onOpen,
}: {
  record: LedgerRecord;
  /** Position in the chain; sets when this record arrives. */
  index: number;
  last: boolean;
  biggest: boolean;
  /** True while this record's details are showing. */
  open: boolean;
  /** Called with the record's node, which the details grow out of. */
  onOpen: (node: Element | null) => void;
}) {
  const { check, signerWallet, signature, role } = record;
  const position: Record<`--${string}`, number> = { "--i": index };

  return (
    <li
      className="record"
      data-status={check.status}
      data-open={open || undefined}
      style={position as CSSProperties}
    >
      <span className="record-rail" aria-hidden="true">
        {!last && (
          <span className="record-link">
            <span className="record-spark" />
          </span>
        )}
        <RecordNode status={check.status} />
      </span>
      <div className="record-card">
        <div className="record-head">
          <h3>
            <button
              type="button"
              className="record-open"
              aria-haspopup="dialog"
              onClick={(event) =>
                onOpen(event.currentTarget.closest(".record")?.querySelector(".record-node") ?? null)
              }
            >
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
