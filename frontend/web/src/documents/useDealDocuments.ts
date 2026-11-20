import { useCallback, useEffect, useState } from "react";
import type { DealDocument } from "@groundtruth/shared";
import { listDocuments } from "../data/documentSource";

const REFRESH_MS = 10_000;
/** Sooner while a just-uploaded document's parcel check is still running. */
const CHECKING_REFRESH_MS = 3_000;

export type DealDocumentsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; documents: DealDocument[] };

/** A deal's document metadata, re-read every ten seconds (three while a check runs) and on `refresh`. */
export function useDealDocuments(dealId: string): {
  state: DealDocumentsState;
  refresh: () => void;
} {
  const [state, setState] = useState<DealDocumentsState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const checking =
    state.status === "ready" &&
    state.documents.some((doc) => doc.parcelCheck?.status === "checking");

  useEffect(() => {
    const controller = new AbortController();
    listDocuments(dealId, controller.signal).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.status === "found") {
          setState({ status: "ready", documents: outcome.documents });
        } else {
          // Keep the last good list on a passing failure.
          setState((current) =>
            current.status === "ready" ? current : { status: "error", message: outcome.message },
          );
        }
      },
      () => {},
    );
    const timer = window.setTimeout(
      () => setTick((n) => n + 1),
      checking ? CHECKING_REFRESH_MS : REFRESH_MS,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [dealId, tick, checking]);

  return { state, refresh };
}
