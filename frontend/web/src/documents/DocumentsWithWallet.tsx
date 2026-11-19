import type { Deal, TimelineEvent } from "@groundtruth/shared";
import { DOCUMENTS } from "../content/documents";
import { WalletBar } from "../review/WalletBar";
import { WalletRoot } from "../review/WalletRoot";
import { DealDocuments } from "./DealDocuments";
import { OpenFileButton, ParticipantPanel } from "./ParticipantTools";
import type { DealDocumentsState } from "./useDealDocuments";

/**
 * The deal page's documents section with a wallet: loaded only after a
 * visitor says they are on the deal, so the public page carries no wallet
 * code until then.
 */
export default function DocumentsWithWallet(props: {
  deal: Deal;
  state: DealDocumentsState;
  timeline: readonly TimelineEvent[];
  onUploaded: () => void;
}) {
  return (
    <WalletRoot>
      <DealDocuments
        state={props.state}
        timeline={props.timeline}
        fileAction={(doc) => <OpenFileButton deal={props.deal} doc={doc} />}
        participant={
          <div className="docs-connect">
            <p className="docs-quiet">{DOCUMENTS.participant.note}</p>
            <WalletBar />
            <ParticipantPanel deal={props.deal} onUploaded={props.onUploaded} />
          </div>
        }
      />
    </WalletRoot>
  );
}
