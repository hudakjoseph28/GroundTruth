import { useEffect, useState } from "react";
import {
  escrowErrorByCode,
  sponsoredTransactionPath,
  type FeeSponsorStatus,
  type SponsoredTransactionRequest,
  type SponsoredTransactionResponse,
} from "@groundtruth/shared";
import { REVIEW } from "../content/review";
import { postJson, request } from "../data/api";
import { ActionError, SponsorDeclined, type Sponsor } from "./escrowTx";

/** GET /api/fee-sponsor once; off until it answers, and off if it can't be read. */
export function useFeeSponsor(): FeeSponsorStatus {
  const [status, setStatus] = useState<FeeSponsorStatus>({ enabled: false });
  useEffect(() => {
    const controller = new AbortController();
    void request("/api/fee-sponsor", controller.signal)
      .then((answer) => {
        if (answer.status === "ok" && isStatus(answer.body)) setStatus(answer.body);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return status;
}

/**
 * The Sponsor for one action, or undefined when GroundTruth isn't covering
 * fees. A rate limit, the per-deal cap, or an API that can't cover the fee
 * declines (the wallet pays instead); a refusal the program would also make
 * stops the action with the API's words.
 */
export function sponsorFor(
  status: FeeSponsorStatus,
  dealId: string,
  dealPda: string,
  body: SponsoredTransactionRequest,
): Sponsor | undefined {
  if (!status.enabled) return undefined;
  return {
    feePayer: status.feePayer,
    dealPda,
    request: async () => {
      const answer = await postJson(sponsoredTransactionPath(dealId), body);
      if (answer.status === "ok") {
        if (isResponse(answer.body)) return answer.body;
        throw new SponsorDeclined(REVIEW.fee.fellBack);
      }
      if (answer.status === "failed") throw new SponsorDeclined(REVIEW.fee.fellBack);
      const { code, message, details } = answer.error.error;
      if (code === "RATE_LIMITED" || code === "NOT_FOUND" || details?.sponsor) {
        throw new SponsorDeclined(REVIEW.fee.fellBack);
      }
      const programError = Number(details?.programError);
      if (Number.isInteger(programError)) {
        const known = REVIEW.errors[programError as keyof typeof REVIEW.errors];
        if (typeof known === "string") throw new ActionError(known);
        const named = escrowErrorByCode(programError);
        if (named) throw new ActionError(REVIEW.errors.program(named.message));
      }
      throw new ActionError(message);
    },
  };
}

function isStatus(body: unknown): body is FeeSponsorStatus {
  const value = body as Partial<{ enabled: unknown; feePayer: unknown; maxPerDeal: unknown }>;
  if (value?.enabled === false) return true;
  return (
    value?.enabled === true &&
    typeof value.feePayer === "string" &&
    typeof value.maxPerDeal === "number"
  );
}

function isResponse(body: unknown): body is SponsoredTransactionResponse {
  const value = body as Partial<Record<keyof SponsoredTransactionResponse, unknown>>;
  return (
    typeof value?.transaction === "string" &&
    typeof value.feePayer === "string" &&
    typeof value.signature === "string" &&
    typeof value.lastValidBlockHeight === "number"
  );
}
