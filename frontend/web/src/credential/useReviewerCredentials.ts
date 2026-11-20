import { useEffect, useMemo, useState } from "react";
import type { CredentialRead, CredentialSubject } from "./readCredentials";

export type CredentialReads = ReadonlyMap<string, CredentialRead> | "loading";

/**
 * Reads the reviewers' staged SAS credentials from devnet once per set of
 * reviewers. `enabled` false reads nothing (and returns null), so pages that
 * do not show credentials never load the reader.
 */
export function useReviewerCredentials(
  subjects: readonly CredentialSubject[],
  enabled: boolean,
): CredentialReads | null {
  const key = subjects.map((s) => `${s.role}:${s.wallet}`).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the subjects.
  const stable = useMemo(() => subjects, [key]);
  const [reads, setReads] = useState<{
    key: string;
    reads: ReadonlyMap<string, CredentialRead>;
  } | null>(null);

  useEffect(() => {
    if (!enabled || stable.length === 0) return;
    const abort = new AbortController();
    void import("./readCredentials").then(({ readReviewerCredentials }) =>
      readReviewerCredentials(stable, { signal: abort.signal }).then(
        (result) => {
          if (!abort.signal.aborted) setReads({ key, reads: result });
        },
      ),
    );
    return () => abort.abort();
  }, [enabled, stable, key]);

  if (!enabled) return null;
  return reads && reads.key === key ? reads.reads : "loading";
}
