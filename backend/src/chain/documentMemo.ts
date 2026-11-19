import { DOCUMENT_MEMO_PREFIX, isSha256Hex } from "@groundtruth/shared";

/**
 * The document hash an approval transaction committed to, from the text of
 * its top-level SPL Memo instructions (the Stream filter's `memos`, which
 * holds only instructions of the Memo v1 and v2 programs).
 *
 * - A memo counts only when it is exactly `groundtruth:doc:` and a
 *   lowercase hex SHA-256.
 * - No document memo, or two naming different documents, yields null: the
 *   approval then cites nothing rather than a guess.
 */
export function documentHashFromMemos(memos: readonly string[]): string | null {
  const hashes = new Set<string>();
  for (const memo of memos) {
    if (!memo.startsWith(DOCUMENT_MEMO_PREFIX)) continue;
    const hash = memo.slice(DOCUMENT_MEMO_PREFIX.length);
    if (isSha256Hex(hash)) hashes.add(hash);
  }
  return hashes.size === 1 ? [...hashes][0]! : null;
}
