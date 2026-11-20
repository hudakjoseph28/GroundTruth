# Fee-sponsored reviewer approval on devnet (2026-11-20 UTC)

The staged **title** reviewer approved `staged-devnet-deal-pay-rehearsal` from `/review`, with GroundTruth's dedicated devnet fee payer paying the network fee. The API built the `sign_approval`, simulated it on devnet, and signed it **only as fee payer**. The reviewer's key added the reviewer's signature, and the escrow program checked it. Rehearsal deal only: `staged-devnet-deal-live` was not read, requested, or sent to. `staged-devnet-deal-rehearsal-v3` was not changed: it still has septic waiting, for the stage rehearsal. Staged wallets and test funds only. Public keys and signatures only.

- Deal PDA: [`9zy4EJot…qszL`](https://explorer.solana.com/address/9zy4EJot1UdRFjHzhBJrQPiQBQpp7oXhBhmBKrbtqszL?cluster=devnet) (funded with 1 test USDC; record: [`devnet-solana-pay-fund-v1.md`](devnet-solana-pay-fund-v1.md))
- GroundTruth fee payer: [`A9i68B2u…oRep`](https://explorer.solana.com/address/A9i68B2u6SkbXPHLwGDotEXBVQ7jVodQ7J5cJ1WhoRep?cluster=devnet), a fresh keypair that is no staged party. Its secret key is not in Git.
- Title reviewer: `ExxnTPx24fjXRiAPcnrWqKCfEQDhDmxCDZ57VQ7RkBRW`

## How it was run

- The API ran locally from this branch with `FEE_SPONSOR_SECRET_KEY` set, against a throwaway Postgres. `replay:devnet` brought the deal rows up to devnet state. The API read public devnet (`https://api.devnet.solana.com`).
- The web portal ran locally (Vite) against that API, in headless Chrome. **The wallet was an injected Phantom-compatible provider, not the Phantom extension.** It signed with the staged title keypair, only in the title wallet's own signature slot, as a wallet does.
- **Funding the fee payer.** Devnet's RPC faucet refused (`410: The RPC faucet is closed on this cluster`). So 0.2 devnet SOL moved from the staged buyer to the fee payer: [`295E15Nw…b8md`](https://explorer.solana.com/tx/295E15Nw2vjpPA1Tzfecyr1qjkahdHr664S9gSgSaBgqimqrsP4PKGQiVbXLhimnVEsnHUURNmvA1pvQYKLmb8md?cluster=devnet) (slot 524169551, 00:19:40Z; buyer 1.81077156 → 1.61076656 SOL).

## Approval

| Step | Fee payer | Signers | Result | Slot | Signature |
| --- | --- | --- | --- | --- | --- |
| sign_approval (title), from `/review` | GroundTruth `A9i6…oRep` | fee payer, then title | ok, finalized; log `Instruction: SignApproval` | 524170079 (00:21:46Z) | [`5WhMnUap…kuqP`](https://explorer.solana.com/tx/5WhMnUapBd9wRt3R6hzRmVDK5J55geqRDCqB52Ygw7EWmE2DqamkX65tBZcAEJb7EzRV5sE9SkbM1TiE8Ne4kuqP?cluster=devnet) |

| Lamports (from the transaction's meta) | Fee payer | Title reviewer |
| --- | --- | --- |
| before | 200,000,000 | 50,000,000 |
| after | 199,990,000 | 50,000,000 |

The fee was 10,000 lamports: two signatures, and no priority fee because recent fees were zero. The wallet saw the transaction with the fee payer's slot already signed and its own slot empty. The instructions were two ComputeBudget instructions and `sign_approval` (program `ASQoBt…EBZG`). On devnet afterwards, title is signed and survey and septic are waiting.

## The reviewer's signature is still required

The API returned a `sign_approval` for the survey reviewer on the same deal. It was **never sent**, only simulated:

| Simulation (`simulateTransaction`) | Result |
| --- | --- |
| As returned (fee payer signed, reviewer slot empty), `sigVerify: true` | `SignatureFailure` |
| A random key's signature in the reviewer's slot, `sigVerify: true` | `SignatureFailure` |
| Same message, `sigVerify: false` | no error, `Instruction: SignApproval`. Only the reviewer's signature is missing. |

## Other requests to the same deal (nothing sent)

| Request | Answer |
| --- | --- |
| `place_hold` as survey | `200`: signed by the fee payer only after a devnet simulation passed. Never sent, so it expired. |
| `release` as survey before every approval | `409` "Not every required reviewer has signed yet…" |
| `fund` as the buyer | `400` "Only sign_approval, place_hold, release are sponsored…" |
| `release` as the buyer | `403` "This wallet isn't an assigned reviewer on this deal…" |
| `sign_approval` as title with role `septic` | `403` "This wallet reviews this deal as title, not septic." |
| `sign_approval` as title on `staged-devnet-deal-rehearsal-v3` (already signed) | `409` "This wallet already signed its approval on Solana devnet." |
| any action on `my-deal` | `404` "Network fees are covered only on GroundTruth's staged devnet deals." |

The local `SponsoredFeeRecord` table then held three rows for the deal: the hold, the title approval, and the survey approval. The cap is 12.
