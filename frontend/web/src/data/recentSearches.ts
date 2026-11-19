const KEY = "groundtruth.recent-searches";
const MAX = 6;

/** The last searches this browser ran, newest first. Storage failures stay empty. */
export function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

/** Remember one search. A repeat moves to the front. Returns the list now stored. */
export function rememberSearch(query: string): string[] {
  const next = [query, ...readRecentSearches().filter((item) => item !== query)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode and a full disk both leave the list on screen only.
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, so nothing to clear.
  }
}
