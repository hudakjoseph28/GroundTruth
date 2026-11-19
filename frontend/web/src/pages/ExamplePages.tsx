import { useMemo } from "react";
import { EXAMPLE } from "../content/example";
import type { LiveDeal } from "../deal/useDealFeed";
import { DealDocuments } from "../documents/DealDocuments";
import { EXAMPLE_DATA } from "../example/exampleData";
import { ExampleProvider } from "../example/ExampleContext";
import {
  EXAMPLE_DEAL,
  EXAMPLE_DOCUMENTS,
  EXAMPLE_PARCEL,
  EXAMPLE_TIMELINE,
} from "../example/exampleFixture";
import { usePageTitle } from "../layout/usePageTitle";
import { DealLayout } from "./DealPage";
import { ParcelView } from "./ParcelPage";

// The example parcel (/parcels/sample) and its completed deal (/deals/sample):
// the real parcel and deal views, fed from the example fixture and marked as
// examples throughout. Neither reads the API or devnet.

export function ExampleParcelPage() {
  usePageTitle(EXAMPLE.title.parcel);
  return (
    <ExampleProvider>
      <ParcelView parcel={EXAMPLE_PARCEL} data={EXAMPLE_DATA} />
    </ExampleProvider>
  );
}

export function ExampleDealPage() {
  usePageTitle(EXAMPLE.title.deal);
  const live = useMemo<LiveDeal>(
    () => ({
      status: "ready",
      deal: EXAMPLE_DEAL,
      timeline: EXAMPLE_TIMELINE,
      freshIds: new Set(),
      liveState: null,
      updatedAt: new Date(),
      stale: false,
    }),
    [],
  );
  return (
    <ExampleProvider>
      <DealLayout
        live={live}
        parcel={EXAMPLE_PARCEL}
        documents={
          <DealDocuments
            state={{ status: "ready", documents: EXAMPLE_DOCUMENTS }}
            timeline={EXAMPLE_TIMELINE}
            note={EXAMPLE.deal.documentsNote}
            checkFile={false}
          />
        }
      />
    </ExampleProvider>
  );
}
