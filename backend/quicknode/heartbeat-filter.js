// QuickNode Streams filter: heartbeat.
//
// Paste into the Stream's filter editor (JavaScript). It returns an empty
// batch for every block, so each delivery exercises the real path: QuickNode
// signs it, the API verifies the HMAC on the raw body, validates the payload
// shape, and answers 204 without touching any deal.
//
// Use it only to prove delivery, then pause the Stream: it delivers every
// block, and Streams bills per block processed. Replace it with the
// GroundTruth program filter once the escrow program ID exists.

// QuickNode calls `main(stream)`; this filter ignores the block itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function main() {
  return { transactions: [] };
}
