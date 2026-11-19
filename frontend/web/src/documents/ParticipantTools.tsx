import { useEffect, useRef, useState } from "react";
import {
  DEAL_DOCUMENT_TYPES,
  type Deal,
  type DealDocument,
  type DealDocumentType,
  type DealParticipantRole,
} from "@groundtruth/shared";
import { useWallet } from "@solana/wallet-adapter-react";
import { DOCUMENTS, DOCUMENT_TYPE_LABELS, UPLOADER_LABELS } from "../content/documents";
import { fetchDocumentFile, uploadDocument } from "../data/documentSource";
import { checkUpload, sha256Hex } from "./fileCheck";
import { declined, signDocumentRequest } from "./signedRequest";

/** The role the connected wallet holds on the deal, by the API's own rule. */
export function participantRole(deal: Deal, wallet: string | null): DealParticipantRole | null {
  if (!wallet) return null;
  if (wallet === deal.buyerWallet) return "buyer";
  if (wallet === deal.sellerWallet) return "seller";
  return deal.reviewers.find((r) => r.wallet === wallet)?.role ?? null;
}

/** Who the connected wallet is on this deal, and the upload form if it is on it. */
export function ParticipantPanel({ deal, onUploaded }: { deal: Deal; onUploaded: () => void }) {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const role = participantRole(deal, wallet);
  if (!wallet) return null;
  if (!role) {
    return (
      <p className="docs-quiet" role="status">
        {DOCUMENTS.participant.notOnDeal}
      </p>
    );
  }
  if (!signMessage) {
    return (
      <p className="docs-quiet" role="status">
        {DOCUMENTS.participant.noSignMessage}
      </p>
    );
  }
  return (
    <div className="docs-participant">
      <p className="docs-you">{DOCUMENTS.participant.youAre(UPLOADER_LABELS[role])}</p>
      <UploadForm deal={deal} wallet={wallet} signMessage={signMessage} onUploaded={onUploaded} />
    </div>
  );
}

type Phase =
  | { phase: "idle" }
  | { phase: "busy"; words: string }
  | { phase: "done"; words: string }
  | { phase: "failed"; words: string };

function UploadForm({
  deal,
  wallet,
  signMessage,
  onUploaded,
}: {
  deal: Deal;
  wallet: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onUploaded: () => void;
}) {
  const [type, setType] = useState<DealDocumentType>(defaultType(participantRole(deal, wallet)));
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Phase>({ phase: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const busy = status.phase === "busy";

  const submit = async () => {
    if (!file) {
      setStatus({ phase: "failed", words: DOCUMENTS.upload.noFile });
      return;
    }
    setStatus({ phase: "busy", words: DOCUMENTS.upload.hashing });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkUpload(file.name, bytes);
    if (!checked.ok) {
      setStatus({ phase: "failed", words: DOCUMENTS.upload[checked.reason] });
      return;
    }
    const sha256 = await sha256Hex(bytes);
    setStatus({ phase: "busy", words: DOCUMENTS.upload.signing });
    let auth: Record<string, string>;
    try {
      auth = await signDocumentRequest({
        dealId: deal.id,
        wallet,
        request: { action: "upload", sha256 },
        signMessage,
      });
    } catch (error) {
      setStatus({
        phase: "failed",
        words: declined(error) ? DOCUMENTS.errors.rejected : DOCUMENTS.errors.unknown,
      });
      return;
    }
    setStatus({ phase: "busy", words: DOCUMENTS.upload.sending });
    const outcome = await uploadDocument({ dealId: deal.id, file, bytes, type, auth });
    if (outcome.status === "rejected") {
      setStatus({ phase: "failed", words: outcome.message });
      return;
    }
    setStatus({ phase: "done", words: DOCUMENTS.upload.done(outcome.value.filename) });
    setFile(null);
    if (input.current) input.current.value = "";
    onUploaded();
  };

  return (
    <form
      className="docs-upload"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="docs-subtitle">{DOCUMENTS.upload.title}</h3>
      <label>
        <span>{DOCUMENTS.upload.type}</span>
        <select value={type} disabled={busy} onChange={(e) => setType(e.target.value as DealDocumentType)}>
          {DEAL_DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {DOCUMENT_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{DOCUMENTS.upload.file}</span>
        <input
          ref={input}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus({ phase: "idle" });
          }}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !file}>
        {DOCUMENTS.upload.submit}
      </button>
      {status.phase !== "idle" && (
        <p
          className="docs-status"
          data-phase={status.phase}
          role={status.phase === "failed" ? "alert" : "status"}
        >
          {status.words}
        </p>
      )}
    </form>
  );
}

function defaultType(role: DealParticipantRole | null): DealDocumentType {
  if (role === "septic") return "septicSoilEvaluation";
  if (role === "survey") return "surveyPlat";
  if (role === "title") return "titleCommitment";
  return "other";
}

/** "Open file": signs a fresh view request, fetches the bytes, and offers them as a download. */
export function OpenFileButton({ deal, doc }: { deal: Deal; doc: DealDocument }) {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [status, setStatus] = useState<Phase>({ phase: "idle" });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!wallet || !signMessage || !participantRole(deal, wallet)) return null;

  const open = async () => {
    setStatus({ phase: "busy", words: DOCUMENTS.view.signing });
    let auth: Record<string, string>;
    try {
      auth = await signDocumentRequest({
        dealId: deal.id,
        wallet,
        request: { action: "view", documentId: doc.id },
        signMessage,
      });
    } catch (error) {
      setStatus({
        phase: "failed",
        words: declined(error) ? DOCUMENTS.errors.rejected : DOCUMENTS.errors.unknown,
      });
      return;
    }
    setStatus({ phase: "busy", words: DOCUMENTS.view.loading });
    const outcome = await fetchDocumentFile({ dealId: deal.id, documentId: doc.id, auth });
    if (outcome.status === "rejected") {
      setStatus({ phase: "failed", words: outcome.message });
      return;
    }
    setUrl(URL.createObjectURL(outcome.value));
    setStatus({ phase: "idle" });
  };

  return (
    <div className="docs-open">
      {url ? (
        <a className="btn btn-small" href={url} download={doc.filename}>
          {DOCUMENTS.view.ready(doc.filename)}
        </a>
      ) : (
        <button
          type="button"
          className="btn btn-small"
          disabled={status.phase === "busy"}
          onClick={() => void open()}
        >
          {status.phase === "busy" ? status.words : DOCUMENTS.view.button}
        </button>
      )}
      {status.phase === "failed" && (
        <p className="docs-status" data-phase="failed" role="alert">
          {status.words}
        </p>
      )}
    </div>
  );
}
