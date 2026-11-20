// In-memory sliding-window limits for sponsored transactions: per reviewer
// wallet and across the whole API. Not per IP: browser calls arrive through
// Vercel's rewrite, so the client IP Railway sees is Vercel's. The durable
// per-deal cap (ledger.ts) bounds total spend across restarts.

export interface RateLimits {
  /** Requests one wallet may make per window. */
  perWallet: number;
  /** Requests the whole API answers per window. */
  global: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  perWallet: 5,
  global: 30,
  windowMs: 60_000,
};

export interface RateLimiter {
  /** True and counted if `wallet` may make a request now; false otherwise. */
  take(wallet: string): boolean;
}

export function createRateLimiter(
  limits: RateLimits = DEFAULT_RATE_LIMITS,
  now: () => number = Date.now,
): RateLimiter {
  const byWallet = new Map<string, number[]>();
  let all: number[] = [];

  const recent = (times: number[], at: number) =>
    times.filter((t) => at - t < limits.windowMs);

  return {
    take(wallet) {
      const at = now();
      all = recent(all, at);
      const mine = recent(byWallet.get(wallet) ?? [], at);
      // Forget idle wallets so the map stays small.
      for (const [key, times] of byWallet) {
        if (recent(times, at).length === 0) byWallet.delete(key);
      }
      if (all.length >= limits.global || mine.length >= limits.perWallet) {
        if (mine.length > 0) byWallet.set(wallet, mine);
        return false;
      }
      all.push(at);
      mine.push(at);
      byWallet.set(wallet, mine);
      return true;
    },
  };
}
