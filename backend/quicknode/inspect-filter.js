// QuickNode Streams filter: shape inspector. Run it with the filter editor's
// test button on a Solana devnet block; do not deploy it as the Stream's
// filter. It reports which fields the block payload has, so the GroundTruth
// program filter reads the slot, block time, signatures, and logs from the
// right places. Everything it returns is public chain data.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main(stream) {
  const data = Array.isArray(stream.data) ? stream.data : [stream.data];
  const block = data[0] || {};
  const tx = (block.transactions || [])[0] || {};
  const message = (tx.transaction && tx.transaction.message) || {};
  return {
    metadata: stream.metadata,
    dataIsArray: Array.isArray(stream.data),
    dataLength: data.length,
    blockKeys: Object.keys(block),
    slot: block.slot,
    parentSlot: block.parentSlot,
    blockHeight: block.blockHeight,
    blockTime: block.blockTime,
    transactionCount: (block.transactions || []).length,
    txKeys: Object.keys(tx),
    metaKeys: Object.keys(tx.meta || {}),
    firstLogLines: ((tx.meta && tx.meta.logMessages) || []).slice(0, 3),
    signatureSample: ((tx.transaction && tx.transaction.signatures) || [])[0],
    messageKeys: Object.keys(message),
    accountKeySample: (message.accountKeys || [])[0],
    instructionSample: (message.instructions || [])[0],
  };
}
