import type { ReviewerRole } from "@groundtruth/shared";
import { CREDENTIAL } from "../content/credential";
import { explorerAddressUrl } from "../data/ledger";
import type { CredentialReads } from "./useReviewerCredentials";
import "./credential.css";

/** One reviewer's staged SAS credential, as read from devnet: a link only when it checks out. */
export function CredentialBadge({
  reads,
  wallet,
  role,
}: {
  reads: CredentialReads;
  wallet: string;
  role: ReviewerRole;
}) {
  const read = reads === "loading" ? null : reads.get(`${role}:${wallet}`);
  if (!read) {
    return (
      <span className="credential-badge" data-status="loading" role="status">
        {CREDENTIAL.checking}
      </span>
    );
  }
  if (read.status === "verified") {
    return (
      <span className="credential-badge" data-status="verified">
        <a
          href={explorerAddressUrl(read.attestation)}
          target="_blank"
          rel="noreferrer"
          title={CREDENTIAL.title(read.role, read.issuer)}
        >
          {CREDENTIAL.verified}
          <span aria-hidden="true">{"\u00a0↗"}</span>
          <span className="visually-hidden"> ({CREDENTIAL.newTab})</span>
        </a>
        {read.staged && (
          <span className="credential-staged">{CREDENTIAL.staged}</span>
        )}
      </span>
    );
  }
  const words =
    read.status === "none"
      ? CREDENTIAL.none
      : read.status === "invalid"
        ? CREDENTIAL.invalid
        : CREDENTIAL.error;
  const detail =
    read.status === "invalid"
      ? read.reason
      : read.status === "error"
        ? read.message
        : undefined;
  return (
    <span className="credential-badge" data-status={read.status} title={detail}>
      {words}
    </span>
  );
}
