// QuickNode Streams filter: GroundTruth escrow program (Solana devnet, Block
// dataset). Paste into the Stream's filter editor (JavaScript).
//
// Returns exactly the body POST /api/webhooks/quicknode accepts, in block
// order, or null to skip a block with no GroundTruth activity:
//
//   { "transactions": [
//       { signature, slot, blockTime, logMessages },              // succeeded
//       { signature, slot, blockTime, logMessages,                // release failed
//         err, releaseAccounts } ] }
//
// QuickNode delivers the return value as-is (checked with the final-payload
// preview on devnet block 522700233).
//
// Successful transactions that touched the program, directly or by CPI, are
// sent; the API decodes program events from their logs. A failed transaction
// is sent only when the instruction that failed is a top-level GroundTruth
// `release`, so the API can show the rejected payout on the deal timeline.
// Keep in sync with src/routes/quicknodeWebhook.ts and backend/README.md.

// Set to the deployed escrow program ID before using this filter.
const PROGRAM_ID = "REPLACE_WITH_ESCROW_PROGRAM_ID";

// `release` takes no arguments, so its instruction data is exactly its
// 8-byte Anchor discriminator, base58 encoded (from the IDL in
// packages/shared; quicknodeFilters.test.ts checks this value).
const RELEASE_IX_DATA = "jUrc3RxQy1A";

function touchesProgram(tx) {
  const message = (tx.transaction && tx.transaction.message) || {};
  const top = message.instructions || [];
  if (top.some((ix) => ix.programId === PROGRAM_ID)) return true;
  const inner = (tx.meta && tx.meta.innerInstructions) || [];
  return inner.some((group) =>
    (group.instructions || []).some((ix) => ix.programId === PROGRAM_ID),
  );
}

// The top-level GroundTruth `release` instruction that made the transaction
// fail, or null. `err` looks like { InstructionError: [index, detail] }.
function failedRelease(tx) {
  const failure = tx.meta.err && tx.meta.err.InstructionError;
  if (!Array.isArray(failure) || typeof failure[0] !== "number") return null;
  const message = (tx.transaction && tx.transaction.message) || {};
  const ix = (message.instructions || [])[failure[0]];
  if (!ix || ix.programId !== PROGRAM_ID || ix.data !== RELEASE_IX_DATA) {
    return null;
  }
  return ix;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main(stream) {
  const blocks = Array.isArray(stream.data) ? stream.data : [stream.data];
  const transactions = [];
  for (const block of blocks) {
    if (!block || typeof block.slot !== "number") continue;
    for (const tx of block.transactions || []) {
      if (!tx.meta) continue;
      const entry = {
        signature: tx.transaction.signatures[0],
        slot: block.slot,
        blockTime: block.blockTime,
        logMessages: tx.meta.logMessages || [],
      };
      if (tx.meta.err === null) {
        if (touchesProgram(tx)) transactions.push(entry);
        continue;
      }
      const release = failedRelease(tx);
      if (!release) continue;
      // Written out instead of spread: the filter runtime's JS support is
      // not documented, so this file sticks to ES5-style objects.
      transactions.push({
        signature: entry.signature,
        slot: entry.slot,
        blockTime: entry.blockTime,
        logMessages: entry.logMessages,
        err: tx.meta.err,
        releaseAccounts: release.accounts || [],
      });
    }
  }
  return transactions.length ? { transactions } : null;
}
