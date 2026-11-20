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

## 2026-11-19 rehearsal v3 stage-prep: [`devnet-stage-rehearsal-v3.md`](devnet-stage-rehearsal-v3.md)

The first devnet run of the hardened sender (ComputeBudget limit and capped priority fee, fresh blockhash with `lastValidBlockHeight`, rebroadcast, resend on expiry). `stage-prep --deal staged-devnet-deal-rehearsal-v3` sent initialize, fund, and the title and survey approvals for 5 test USDC. The deal is funded with septic waiting.

To exercise the resend on purpose, the run went through a local test proxy (the JSON's `rpc` is `http://127.0.0.1:8911`). The proxy forwarded every call to `https://api.devnet.solana.com` except the broadcasts of the first transaction, which it answered without forwarding. That first `initialize_deal`, signature `3Ev8zSxVGzUfHu72Anz6Pf2sXLhLN4J6eW88ouvz5R2Fv7BYJC9FYWdeYYqCnkBE842CsoPBtHEY3kskivEWes7t`, was dropped 17 times. After its blockhash expired, devnet had no record of it, even with `searchTransactionHistory`. The script then re-signed it on a fresh blockhash, and that one landed: [`2q9hwKjn…rwXG5`](https://explorer.solana.com/tx/2q9hwKjnb4GEvrTMqRiSXvi2K8XzhGby4UcBgL4ZubKiCjMHKCqLmFiMXhvciM8bEuT3Mq6rSdtdrth82NErwXG5?cluster=devnet). Its JSON step records `"attempts": 2`. Each step records its `computeUnitLimit` and `computeUnitPriceMicroLamports`. Recent prioritization fees on these accounts were all 0 on devnet, so the price was 0.

## 2026-11-19 Solana Pay rehearsal: [`devnet-solana-pay-fund-v1.md`](devnet-solana-pay-fund-v1.md)

The 1 test USDC deal `staged-devnet-deal-pay-rehearsal` was initialized with `demo:deals stage-init` ([`devnet-stage-pay-rehearsal-v1.md`](devnet-stage-pay-rehearsal-v1.md)). It was then funded with the unsigned transaction from `POST /api/deals/:id/solana-pay/fund`, signed by the staged buyer key through the official `@solana/pay` client. No real wallet app was used.

## 2026-11-20 (UTC) Fee-sponsored approval: [`devnet-fee-sponsored-approval-v1.md`](devnet-fee-sponsored-approval-v1.md)

The title reviewer approved `staged-devnet-deal-pay-rehearsal` from `/review`, with GroundTruth's dedicated devnet fee payer paying the network fee ([`5WhMnUap…kuqP`](https://explorer.solana.com/tx/5WhMnUapBd9wRt3R6hzRmVDK5J55geqRDCqB52Ygw7EWmE2DqamkX65tBZcAEJb7EzRV5sE9SkbM1TiE8Ne4kuqP?cluster=devnet)). The fee payer lost 10,000 lamports and the title wallet lost none. The API signed only as fee payer. Without the reviewer's signature, devnet's signature check refuses the transaction. The wallet was an injected Phantom-compatible provider, not the extension. The live deal and rehearsal v3 were not touched.

## 2026-11-19 staged reviewer credentials on SAS: [`sas-credentials-devnet.md`](sas-credentials-devnet.md)

`pnpm --filter @groundtruth/escrow sas:credentials issue` created, on the Solana Attestation Service (`22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`, devnet), a staged issuer, the schema `GroundTruth staged reviewer` (field layout `role: string, issuer: string, staged: bool`), and one attestation per staged reviewer wallet (title, survey, septic). Each attestation's `issuer` field reads "GroundTruth staged demo issuer (devnet test credential, not a license)" and `staged` is `true`. They do not expire. The staged buyer paid the rent; the new staged issuer keypair (`escrow/.demo-wallets/issuer.json`, gitignored, public key `E9jmb9CE…sYBRk`) signed. The escrow program does not read these accounts, and no deal was touched.

The first `issue` run created the credential, the schema, and the title attestation, then stopped at its own read-back: the script had the account discriminators wrong (SAS writes credential 0, schema 1, attestation 2). After the fix, a second run skipped those three and created the survey and septic attestations. All read back OK. The first run's three signatures were copied into the record from its console output. All five are `finalized` with no error per `getSignatureStatuses`.
