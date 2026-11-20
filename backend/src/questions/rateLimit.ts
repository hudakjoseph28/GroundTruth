export interface QuestionRateLimiter {
  /** Questions allowed per client per window. */
  readonly limit: number;
  take(key: string): { allowed: boolean; retryAfterSeconds: number };
}

/**
 * Per-instance sliding window: `limit` questions per client and `globalLimit`
 * across all clients per `windowMs`. Production runs one API process.
 */
export function createQuestionRateLimiter(
  options: {
    limit?: number;
    globalLimit?: number;
    windowMs?: number;
    now?: () => number;
  } = {},
): QuestionRateLimiter {
  const limit = options.limit ?? 6;
  const globalLimit = options.globalLimit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, number[]>();
  let everyone: number[] = [];

  const denied = (oldest: number, at: number) => ({
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - at) / 1_000)),
  });

  return {
    limit,
    take(key) {
      const at = now();
      const since = at - windowMs;
      everyone = everyone.filter((stamp) => stamp > since);
      const recent = (buckets.get(key) ?? []).filter((stamp) => stamp > since);
      if (recent.length >= limit) return denied(recent[0]!, at);
      if (everyone.length >= globalLimit) return denied(everyone[0]!, at);
      recent.push(at);
      everyone.push(at);
      buckets.set(key, recent);
      // Drop idle clients so the map cannot grow without bound.
      if (buckets.size > 10_000) {
        for (const [client, stamps] of buckets) {
          if (!stamps.some((stamp) => stamp > since)) buckets.delete(client);
        }
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
