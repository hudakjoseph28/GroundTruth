# Phase 1 · Escrow

**Outcome.** A buyer can fund a staged deal in test USDC. A disputed deal stays funded when release is rejected. A cleared deal pays the bound seller once. Both results have a transaction signature and before/after balances.

**Read first**

- The closing diagram in [Architecture](../../architecture/Architecture.md)
- The Accord section of [Reference builds](../../context/ReferenceBuilds.md)
- The Nov 13–15 checkpoints in the [UBC brief](../../ubc/UBC-Hackathon.md)

## Carry in

Use a deal-scoped SPL token vault. Bind the buyer, the seller payout wallet, the assigned reviewers, the USDC mint, and the amount before funding. Amounts are integer token base units, so the UI, the vault, and the recipient account can be compared directly.

On Devnet, use Circle test USDC, mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. The program checks that mint on every transfer. Release pays the bound seller the full agreed amount. Refund pays the bound buyer. A second settlement fails.

The buyer-visible states are: evidence received, reviewer decision signed, and funds still held or settled. The UI may explain readiness. Solana decides whether the funds move.

## Leave behind

Accord’s 1% fee, referral split, payment tranches, jury, and grace-period auto-release. Silence or a missing signature leaves the vault unchanged. SOLstice’s native SOL transfer and any server route that submits a hard-coded approval stay out. The SOLstice release excerpt is still unpinned, so it is a design caution and not a program interface.

## Demo scope

Two staged deals are enough: one with an active hold, one with the required reviewer signatures and no hold. Participants and funds are labeled as staged Devnet roles. Deed transfer stays off-chain. A fresh deal is an explicit reset, and a refresh keeps the same deal and receipt.

Local tests cover the negative cases. A short Devnet pass covers the held payout and the cleared payout. Save both signatures.

## Acceptance checks

1. Record vault, buyer, and seller balances. Submit release on the held deal. The program rejects it, and all three balances are unchanged.
2. On the cleared deal, the seller balance increases by the agreed amount and the vault balance is zero. Submit release again. The second settlement fails.
3. An authorized refund returns the vault balance to the buyer and leaves the seller unchanged.

## Depends on

The voice callback and the second-device update belong to [phase 3](../03-connect-surfaces/ConnectSurfaces.md). This phase can use staged signatures without those integrations. Share the deal fixture with [phase 2](../02-parcel-research/ParcelResearch.md) so the report and the closing refer to the same parcel.
