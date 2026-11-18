# Demo closing results

Proof of the two staged GroundTruth closings on Solana devnet, written by `escrow/scripts/demo-deals.ts`. Public keys and signatures only. Simulation output (`simulation.*`) is gitignored and is not proof.

## 2026-11-18 run: [`devnet-20261118T174830Z.md`](devnet-20261118T174830Z.md)

Both closings completed against program `ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG` (upgraded at slot 523474592), each for 25 test USDC:

- **Held deal** (`staged-devnet-deal`): initialize → fund → title hold → release, which **failed on-chain with DealHeld (6019)** with balances unchanged → refund of exactly 25 USDC.
- **Released deal** (`staged-devnet-deal-released`): initialize → fund → title, survey and septic approvals → release of exactly 25 USDC to the seller.

The run took three invocations of `run`. The public devnet RPC rate-limited (HTTP 429) the first two:

1. `20261118T174115Z` stopped after the held deal's hold, on a balance read. Its results file also mixed in the local rehearsal's entries (a bug since fixed: the rehearsal and the devnet run shared arrays). So it is **not committed**.
2. `20261118T174645Z` (`run --resume`) sent the rejected release and the refund. It crashed while confirming the refund, inside web3.js's `confirmTransaction`, before recording it.
3. `20261118T174830Z` (`run --resume`) recovered the refund from the deal's on-chain history (marked "recovered from chain"), then ran the whole released deal.

The committed record keeps only signatures that `getSignatureStatuses` reports as confirmed on devnet. The run dropped 12 rehearsal signatures that were never sent.

The "after refund" balances were read when the third invocation started, before the released deal ran; nothing else moves those accounts in between. Final balances were checked directly on devnet after the run:

- buyer USDC `7gXgJ3bk…kJ73`: 15;
- seller USDC `CZQyg2JG…G5Zu`: 25;
- both vaults closed.

The same 11 transactions are recorded as backend test data in `backend/test/fixtures/devnet/` (`program-history.json`, `demo-run/`).
