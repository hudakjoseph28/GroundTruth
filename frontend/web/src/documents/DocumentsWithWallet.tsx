import type { Deal, TimelineEvent } from "@groundtruth/shared";
import { DOCUMENTS } from "../content/documents";
import { WalletBar } from "../review/WalletBar";
import { WalletRoot } from "../review/WalletRoot";
import { DealDocuments } from "./DealDocuments";
import { FindingsButton, useDocumentFindings } from "./DocumentFindings";
import { OpenFileButton, ParticipantPanel } from "./ParticipantTools";
import type { DealDocumentsState } from "./useDealDocuments";

interface Props {
  deal: Deal;
  state: DealDocumentsState;
  timeline: readonly TimelineEvent[];
  onUploaded: () => void;
}

/**
 * The deal page's documents section with a wallet: loaded only after a
 * visitor says they are on the deal, so the public page carries no wallet
 * code until then.
 */
export default function DocumentsWithWallet(props: Props) {
  return (
    <WalletRoot>
      <WithWallet {...props} />
    </WalletRoot>
  );
}

function WithWallet(props: Props) {
  const findings = useDocumentFindings(props.deal);
  return (
    <DealDocuments
      state={props.state}
      timeline={props.timeline}
      findings={findings.byId}
      fileAction={(doc) => <OpenFileButton deal={props.deal} doc={doc} />}
      participant={
        <div className="docs-connect">
          <p className="docs-quiet">{DOCUMENTS.participant.note}</p>
          <WalletBar />
          <FindingsButton findings={findings} />
          <ParticipantPanel deal={props.deal} onUploaded={props.onUploaded} />
        </div>
      }
    />
  );
}
