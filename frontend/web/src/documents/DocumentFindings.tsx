import { useCallback, useState } from "react";
import type { Deal, DocumentFindings } from "@groundtruth/shared";
import { useWallet } from "@solana/wallet-adapter-react";
import { DOCUMENTS, PARCEL_CHECK } from "../content/documents";
import { fetchDocumentFindings } from "../data/documentSource";
import { participantRole } from "./ParticipantTools";
import { declined, signDocumentRequest } from "./signedRequest";

export type FindingsState =
  | { phase: "idle" }
  | { phase: "busy"; words: string }
  | { phase: "failed"; words: string }
  | { phase: "ready"; byId: ReadonlyMap<string, DocumentFindings> };

/**
 * What the API read from each of the deal's documents, for the connected
 * participant. One wallet signature reads all of them; nothing loads until
 * the person asks. Cleared when the wallet changes.
 */
export function useDocumentFindings(deal: Deal) {
  const { publicKey, signMessage } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  // Keyed by wallet and deal, so another wallet never sees this one's findings.
  const key = `${wallet ?? ""}:${deal.id}`;
  const [stored, setStored] = useState<{ key: string; state: FindingsState }>({
    key,
    state: { phase: "idle" },
  });
  const state: FindingsState = stored.key === key ? stored.state : { phase: "idle" };
  const canLoad = Boolean(wallet && signMessage && participantRole(deal, wallet));

  const load = useCallback(async () => {
    if (!wallet || !signMessage) return;
    const setState = (next: FindingsState) => setStored({ key, state: next });
    setState({ phase: "busy", words: PARCEL_CHECK.findings.signing });
    let auth: Record<string, string>;
    try {
      auth = await signDocumentRequest({
        dealId: deal.id,
        wallet,
        request: { action: "findings" },
        signMessage,
      });
    } catch (error) {
      setState({
        phase: "failed",
        words: declined(error) ? DOCUMENTS.errors.rejected : DOCUMENTS.errors.unknown,
      });
      return;
    }
    setState({ phase: "busy", words: PARCEL_CHECK.findings.loading });
    const outcome = await fetchDocumentFindings({ dealId: deal.id, auth });
    if (outcome.status === "rejected") {
      setState({ phase: "failed", words: outcome.message });
      return;
    }
    setState({
      phase: "ready",
      byId: new Map(outcome.value.map((row) => [row.documentId, row])),
    });
  }, [deal.id, wallet, signMessage, key]);

  return {
    state,
    canLoad,
    load,
    byId: state.phase === "ready" ? state.byId : undefined,
  };
}

/** "Show what each document says": one signature, every document. */
export function FindingsButton({ findings }: { findings: ReturnType<typeof useDocumentFindings> }) {
  if (!findings.canLoad) return null;
  const { state } = findings;
  return (
    <div className="docs-findings">
      <button
        type="button"
        className="btn btn-small"
        disabled={state.phase === "busy"}
        onClick={() => void findings.load()}
      >
        {state.phase === "busy"
          ? state.words
          : state.phase === "ready"
            ? PARCEL_CHECK.findings.refresh
            : PARCEL_CHECK.findings.show}
      </button>
      {state.phase !== "ready" && <p className="docs-quiet">{PARCEL_CHECK.findings.note}</p>}
      {state.phase === "failed" && (
        <p className="docs-status" data-phase="failed" role="alert">
          {state.words}
        </p>
      )}
    </div>
  );
}
