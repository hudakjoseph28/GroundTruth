# Phase 1 · Escrow

**Owner:** Kadhir. Joey wires the generated client into the deal screen after the frontend fixtures render.

**Outcome:** A buyer funds a staged deal in test USDC. A disputed deal stays funded when release is rejected. A cleared deal pays the bound seller once. Both results have a transaction signature and before/after balances.

**Read first:** the closing diagram in [Architecture](../../architecture/Architecture.md) · [Escrow v1](../../architecture/DataContract.md#escrow-v1) · [Accord](../../context/ReferenceBuilds.md#accord) · the Nov 13–15 checkpoints in the [UBC brief](../../ubc/UBC-Hackathon.md#milestones)

## Deliverables

- Anchor workspace in `escrow/`, program in `escrow/programs/groundtruth_escrow`, and tests in `escrow/tests`.
- Checked-in IDL copied or generated into `packages/shared`, plus one client helper that derives the deal PDA and token accounts.
- Program events and rules exactly matching [Escrow v1](../../architecture/DataContract.md#escrow-v1).
- A `docs/proof/` or README proof block containing program ID, cluster, held release signature/error, cleared release signature, and balance table. Never include a private key.

## Build this

- **One deal-scoped SPL token vault per deal.** Bind buyer, seller payout wallet, assigned reviewers, USDC mint, and amount **before** funding. Amounts are integer base units so the UI, vault, and recipient account compare directly. Reviewer wallets must be independent (neither buyer nor seller), and at least one reviewer must be required.
- **Devnet mint:** Circle test USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. The program checks it on every transfer.
- **Release** may be submitted by any fee payer, but succeeds only from `funded` with every required approval, no hold, exact mint/amount, and the bound seller ATA. **Refund** requires the buyer's signature and an active hold. Both pay the full vault and become terminal; a second settlement fails.
- Buyer-visible states: evidence received → reviewer decision signed → funds held or settled. The UI explains readiness; **Solana decides whether funds move.**

## Leave out

Accord's 1% fee, referral split, payment tranches, jury, and grace-period auto-release. Silence or a missing signature leaves the vault unchanged. No native SOL transfers (SOLstice) and no server route that submits a hard-coded approval. The SOLstice release excerpt is unpinned: a design caution, not an interface.

## Demo scope

- Two staged deals: one with an active title hold, one with required title, survey, and septic approvals and no hold. Participants and funds are labeled staged devnet roles. Deed transfer stays off-chain.
- A fresh deal is an explicit reset; a refresh shows the same deal and receipt.
- Local tests cover the negative cases. A short devnet pass covers held and cleared payouts. **Save both signatures.**

## Acceptance checks

1. Record vault, buyer, and seller balances. Submit release on the held deal. The program rejects it and all three balances are unchanged.
2. On the cleared deal, the seller balance rises by the agreed amount and the vault is zero. Submit release again: the second settlement fails.
3. An authorized refund returns the vault balance to the buyer and leaves the seller unchanged.

Run and report:

```bash
pnpm escrow:test
pnpm --filter shared typecheck
```

The local suite also covers wrong mint, wrong destination, unassigned signer, duplicate approval, missing approval, approval-after-hold, and repeated settlement. The devnet pass uses Circle's published test USDC mint and saves Explorer URLs for the held and cleared deals.

## Cut line

The local state machine and balance assertions are non-negotiable. If devnet test USDC or RPC access is unstable, keep retry tooling and a screen recording of the last real pass; do not replace the program with a UI-only status. Fees, tranches, admin recovery, hold clearing, and production legal terms stay out.

## Depends on

Voice callback and second-device updates are [phase 3](../03-connect-surfaces/ConnectSurfaces.md); use staged signatures until then. Share the deal fixture with [phase 2](../02-parcel-research/ParcelResearch.md) so report and closing point at the same parcel.
