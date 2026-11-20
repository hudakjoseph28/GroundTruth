import { useState, type ReactNode } from "react";
import type { DealDocument, DocumentFindings, TimelineEvent } from "@groundtruth/shared";
import { DOCUMENTS, DOCUMENT_TYPE_LABELS, UPLOADER_LABELS } from "../content/documents";
import { formatMoment } from "../data/dealView";
import { CopyButton } from "../parcel/Ledger/CopyButton";
import { matchHash, sha256Hex, shortHash, type HashCheck } from "./fileCheck";
import { ParcelCheckNote } from "./ParcelCheckNote";
import type { DealDocumentsState } from "./useDealDocuments";
import "./documents.css";

/**
 * A deal's documents as anyone may see them: type, filename, who uploaded
 * it, when, its SHA-256, and whether the parcel ID it prints is this deal's
 * (advisory). Never the file or the text read from it. Wallet-free, so the
 * public deal page loads no wallet code; a participant's tools come in
 * through the `participant`, `fileAction`, and `findings` slots.
 */
export function DealDocuments({
  state,
  timeline,
  participant,
  fileAction,
  findings,
  compact = false,
  note,
  checkFile = true,
}: {
  state: DealDocumentsState;
  timeline: readonly TimelineEvent[];
  /** Connect, role, and upload: rendered by a wallet-aware parent. */
  participant?: ReactNode;
  /** An "Open file" control for one document, for a connected participant. */
  fileAction?: (document: DealDocument) => ReactNode;
  /** What each document says, by document ID: a signed participant's view. */
  findings?: ReadonlyMap<string, DocumentFindings>;
  /** The reviewer portal's card: no intro, no file check. */
  compact?: boolean;
  /** Replaces the staged-demo banner (the example deal says its documents are made up). */
  note?: string;
  /** False leaves out "Check a file". */
  checkFile?: boolean;
}) {
  const documents = state.status === "ready" ? state.documents : [];
  return (
    <section className="docs" data-compact={compact} aria-labelledby={compact ? undefined : "docs-title"}>
      {compact ? (
        <h3 className="docs-subtitle">{DOCUMENTS.title}</h3>
      ) : (
        <header className="deal-section-head">
          <h2 id="docs-title">{DOCUMENTS.title}</h2>
          <p className="mono">{documents.length}</p>
        </header>
      )}
      <p className="docs-banner" role="note">
        {note ?? DOCUMENTS.banner}
      </p>
      {!compact && <p className="docs-intro">{DOCUMENTS.intro}</p>}

      {state.status === "loading" ? (
        <p className="docs-quiet" role="status">
          {DOCUMENTS.loading}
        </p>
      ) : state.status === "error" ? (
        <p className="docs-quiet" role="alert">
          {DOCUMENTS.loadError} {state.message}
        </p>
      ) : documents.length === 0 ? (
        <p className="docs-quiet">{DOCUMENTS.empty}</p>
      ) : (
        <ul className="docs-list">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              cited={timeline.filter((event) => event.citedDocument?.document?.id === doc.id)}
              action={fileAction?.(doc)}
              findings={findings?.get(doc.id)}
            />
          ))}
        </ul>
      )}

      {participant}
      {!compact && checkFile && <CheckFile documents={documents} timeline={timeline} />}
    </section>
  );
}

function DocumentRow({
  doc,
  cited,
  action,
  findings,
}: {
  doc: DealDocument;
  cited: TimelineEvent[];
  action?: ReactNode;
  findings?: DocumentFindings;
}) {
  return (
    <li className="docs-row" id={`document-${doc.id}`} data-cited={cited.length > 0}>
      <p className="docs-row-head">
        <strong>{DOCUMENT_TYPE_LABELS[doc.type]}</strong>
        <time dateTime={doc.uploadedAt}>{formatMoment(doc.uploadedAt)}</time>
      </p>
      <p className="docs-filename">{doc.filename}</p>
      <p className="docs-meta">
        <span>{DOCUMENTS.uploadedBy(UPLOADER_LABELS[doc.uploaderRole])}</span>
        <span className="docs-hash">
          {DOCUMENTS.hash}{" "}
          <code className="mono" title={doc.sha256}>
            {shortHash(doc.sha256)}
          </code>
          <CopyButton value={doc.sha256} label={DOCUMENTS.copyHash} icon />
        </span>
      </p>
      <ParcelCheckNote doc={doc} findings={findings} />
      {cited.map((event) => (
        <p key={event.id} className="docs-cited">
          {DOCUMENTS.cited(actorName(event.actorRole))}
        </p>
      ))}
      {action}
    </li>
  );
}

function actorName(role: string | undefined): string {
  return role && role in UPLOADER_LABELS
    ? UPLOADER_LABELS[role as keyof typeof UPLOADER_LABELS]
    : "reviewer";
}

/** Hashes a file in the browser and says whether it is one of the deal's documents. */
function CheckFile({
  documents,
  timeline,
}: {
  documents: readonly DealDocument[];
  timeline: readonly TimelineEvent[];
}) {
  const [result, setResult] = useState<HashCheck | "hashing" | null>(null);

  return (
    <div className="docs-check">
      <h3 className="docs-subtitle">{DOCUMENTS.check.title}</h3>
      <p>{DOCUMENTS.check.body}</p>
      <label className="docs-file">
        <span className="visually-hidden">{DOCUMENTS.check.label}</span>
        <input
          type="file"
          aria-label={DOCUMENTS.check.label}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              setResult(null);
              return;
            }
            setResult("hashing");
            void sha256Hex(file).then((sha256) => setResult(matchHash(sha256, documents, timeline)));
          }}
        />
      </label>
      {result === "hashing" ? (
        <p className="docs-quiet" role="status">
          {DOCUMENTS.check.hashing}
        </p>
      ) : result ? (
        <CheckResult result={result} />
      ) : null}
    </div>
  );
}

function CheckResult({ result }: { result: HashCheck }) {
  const tone = result.document ? "match" : result.citedBy.length > 0 ? "cited" : "none";
  return (
    <div className="docs-result" data-tone={tone} role="status" aria-live="polite">
      <p>
        <strong>
          {result.document
            ? DOCUMENTS.check.match(result.document.filename, UPLOADER_LABELS[result.document.uploaderRole])
            : result.citedBy.length > 0
              ? DOCUMENTS.check.citedOnly
              : DOCUMENTS.check.noMatch}
        </strong>
      </p>
      {result.document &&
        result.citedBy.map((event) => (
          <p key={event.id}>{DOCUMENTS.check.citedToo(actorName(event.actorRole))}</p>
        ))}
      <p className="docs-result-hash">
        {DOCUMENTS.check.yourHash} <code className="mono">{result.sha256}</code>
      </p>
    </div>
  );
}
