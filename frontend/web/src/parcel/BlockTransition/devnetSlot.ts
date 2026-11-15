// The latest slot on Solana devnet, from the public RPC endpoint. No key, no
// wallet, read-only: it only gives the transition real block numbers to show.

const ENDPOINT = "https://api.devnet.solana.com";
const TIMEOUT_MS = 1500;
/** A slot lasts under half a second, so a remembered one goes stale quickly. */
const FRESH_MS = 20_000;

let remembered: { at: number; request: Promise<number | null> } | null = null;

/** Resolves to null when the slot cannot be read in time. Never rejects. */
export function readDevnetSlot(): Promise<number | null> {
  const now = Date.now();
  if (!remembered || now - remembered.at > FRESH_MS) {
    remembered = { at: now, request: request() };
  }
  return remembered.request;
}

async function request(): Promise<number | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
      signal: abort.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const slot = typeof body === "object" && body !== null && "result" in body ? body.result : null;
    return typeof slot === "number" && Number.isSafeInteger(slot) && slot > 0 ? slot : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
