// QuickNode Streams filter: GroundTruth escrow program (Solana devnet, Block
// dataset). Paste into the Stream's filter editor (JavaScript).
//
// Returns exactly the body POST /api/webhooks/quicknode accepts:
//   { "transactions": [{ signature, slot, blockTime, logMessages }] }
// in block order, or null to skip a block with no GroundTruth activity.
// QuickNode delivers the return value as-is (checked with the final-payload
// preview on devnet block 522700233).
//
// Only successful transactions are sent; the API decodes program events from
// their logs. Failed release attempts are not sent yet (see backend README).

// Set to the deployed escrow program ID before using this filter.
const PROGRAM_ID = "REPLACE_WITH_ESCROW_PROGRAM_ID";

function touchesProgram(tx) {
  const message = (tx.transaction && tx.transaction.message) || {};
  const top = message.instructions || [];
  if (top.some((ix) => ix.programId === PROGRAM_ID)) return true;
  const inner = (tx.meta && tx.meta.innerInstructions) || [];
  return inner.some((group) =>
    (group.instructions || []).some((ix) => ix.programId === PROGRAM_ID),
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main(stream) {
  const blocks = Array.isArray(stream.data) ? stream.data : [stream.data];
  const transactions = [];
  for (const block of blocks) {
    if (!block || typeof block.slot !== "number") continue;
    for (const tx of block.transactions || []) {
      if (!tx.meta || tx.meta.err !== null) continue;
      if (!touchesProgram(tx)) continue;
      transactions.push({
        signature: tx.transaction.signatures[0],
        slot: block.slot,
        blockTime: block.blockTime,
        logMessages: tx.meta.logMessages || [],
      });
    }
  }
  return transactions.length ? { transactions } : null;
}
