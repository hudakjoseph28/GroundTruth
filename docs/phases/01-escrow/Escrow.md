# Phase 1 · Escrow

**Owner:** Kadhir. Joey wires the generated client into the deal screen after the frontend fixtures render.

**Outcome:** A buyer funds a staged deal in test USDC. A disputed deal stays funded when release is rejected. A cleared deal pays the bound seller once. Both results have a transaction signature and before/after balances.

**Read first:** the closing diagram in [Architecture](../../architecture/Architecture.md) · [Escrow v1](../../architecture/DataContract.md#escrow-v1) · [Accord](../../context/ReferenceBuilds.md#accord) · the Nov 13–15 checkpoints in the [UBC brief](../../ubc/UBC-Hackathon.md#milestones)

## Deliverables

- Anchor workspace in `escrow/`, program in `escrow/programs/groundtruth_escrow` (implementing 6 instructions and 6 events), and tests in `escrow/tests` (78 integration tests).
- Checked-in IDL copied or generated into `packages/shared`, plus typed client helpers in `packages/shared/src/escrow.ts` (`deriveDealAccounts`, `deriveDealPda`, `deriveVaultPda`, `getDealPdaSeeds`).
- Program events and rules exactly matching [Escrow v1](../../architecture/DataContract.md#escrow-v1).
- Staged deals aligned with the Franklin County golden parcel (`ohio:39049:230-000918`).
- A `docs/proof/` or README proof block containing program ID, cluster, held release signature/error, cleared release signature, and balance table. Never include a private key.

## Build this

- **One deal-scoped SPL token vault per deal.** Bind buyer, seller payout wallet, assigned reviewers, USDC mint, and amount **before** funding. Amounts are integer base units so the UI, vault, and recipient account compare directly. Reviewer wallets must be independent (neither buyer nor seller), and at least one reviewer must be required.
- **Six on-chain instructions:**
  1. `initialize_deal`: Creates Deal PDA, registers buyer, seller, reviewers, USDC mint, and escrow amount. Signer: buyer.
  2. `fund`: Transfers `deal.amount` from buyer ATA to vault; transitions deal state from `Draft` to `Funded`. Signer: buyer.
  3. `sign_approval`: Verifies reviewer assignment and role; records unique reviewer approval. Signer: assigned reviewer.
  4. `place_hold`: Places blocking hold with reason code; transitions deal to `Held`. Signer: assigned reviewer.
  5. `release`: Verifies all required reviewers approved and no hold active; transfers exactly `deal.amount` to bound seller ATA; conditionally closes vault if zero surplus remains; transitions deal to `Released`. Signer: any fee payer.
  6. `refund`: Verifies active hold; transfers exactly `deal.amount` to bound buyer ATA; conditionally closes vault if zero surplus remains; transitions deal to `Refunded`. Signer: bound buyer.
- **Six on-chain events:** `DealInitialized`, `DealFunded`, `ApprovalSigned`, `HoldPlaced`, `DealReleased`, and `DealRefunded`.
- **Devnet mint:** Circle test USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. The program checks it on every transfer.
- **Settlement & Surplus Token Policy:** Both `release` and `refund` transfer exactly the agreed escrow amount (`deal.amount`). If the post-transfer vault balance is zero, the vault account closes and rent lamports return to the buyer. If unsolicited surplus tokens exist, the vault remains open to prevent settlement lockout (`NonNativeHasBalance` revert); surplus USDC and vault rent lamports remain permanently locked in the vault PDA as terminal deals cannot be mutated. Resolving surplus token recovery requires a future contract upgrade or migration.
- Buyer-visible states: evidence received → reviewer decision signed → funds held or settled. The UI explains readiness; **Solana decides whether funds move.**

## Leave out

Accord's 1% fee, referral split, payment tranches, jury, and grace-period auto-release. Silence or a missing signature leaves the vault unchanged. No native SOL transfers (SOLstice) and no server route that submits a hard-coded approval. The SOLstice release excerpt is unpinned: a design caution, not an interface.

## Demo scope

- Two staged deals: one with an active title hold, one with required title, survey, and septic approvals and no hold. Participants and funds are labeled staged devnet roles. Deed transfer stays off-chain.
- A fresh deal is an explicit reset; a refresh shows the same deal and receipt.
- Local tests cover the negative cases. A short devnet pass covers held and cleared payouts. **Save both signatures.**

## Acceptance checks

1. Record vault, buyer, and seller balances. Submit release on the held deal. The program rejects it and all three balances are unchanged.
2. On the cleared deal, the seller balance rises by the agreed amount and the vault is closed (or retains only unsolicited surplus tokens if deposited). Submit release again: the second settlement fails.
3. An authorized refund returns the agreed escrow amount to the buyer ATA and leaves the seller unchanged.

Run and report:

```bash
pnpm escrow:test
pnpm --filter shared typecheck
```

The local suite also covers wrong mint, wrong destination, unassigned signer, duplicate approval, missing approval, approval-after-hold, and repeated settlement. The devnet pass uses Circle's published test USDC mint and saves Explorer URLs for the held and cleared deals.

## Cut line

The local state machine and balance assertions are non-negotiable. If devnet test USDC or RPC access is unstable, keep retry tooling and a screen recording of the last real pass; do not replace the program with a UI-only status. Fees, tranches, admin recovery, hold clearing, and production legal terms stay out.

## Devnet Deployment Record

- **Cluster:** Solana Devnet (`https://api.devnet.solana.com`)
- **Program ID:** `ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`
- **ProgramData Address:** `6cUeMZrSocYM3wHKQDZCHS7Y4MzycousGCydE23VGBLc`
- **Upgrade Authority:** `EqtDJg52HbodFtGReKrXkceQxwqC7Sbdu7m7Ege6cghn`
- **Initial Deploy Slot:** `523173401`
- **Deployment Transaction Signature:** `4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU`
- **Anchor IDL Metadata Account:** `uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma`
- **Solana Explorer (Program):** [ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet)
- **Solana Explorer (Deploy Tx):** [4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU](https://explorer.solana.com/tx/4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU?cluster=devnet)
- **Solana Explorer (IDL):** [uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma](https://explorer.solana.com/address/uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma?cluster=devnet)
- **Circle Test USDC Mint:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

## Demo closings script

[`escrow/scripts/demo-deals.ts`](../../../escrow/scripts/demo-deals.ts) runs both staged closings on devnet against the deployed program. It uses `@solana/web3.js` and the checked-in IDL and needs no Solana CLI.

```bash
pnpm --filter @groundtruth/shared build                 # once, for the IDL and fixtures
pnpm --filter @groundtruth/escrow demo:deals plan       # deal IDs, PDAs, vaults, wallets, token accounts; sends nothing
pnpm --filter @groundtruth/escrow demo:deals            # check: wallets, balances, what to fund
pnpm --filter @groundtruth/escrow demo:deals simulate   # both closings in LiteSVM on the deployed bytecode
pnpm --filter @groundtruth/escrow demo:deals run        # devnet; refuses unless funded and the rehearsal passes
```

- **Wallets:** buyer, seller, and title/survey/septic reviewer keypairs are generated into `escrow/.demo-wallets/` (gitignored, mode 0600). Only public keys are printed or recorded.
- **Funding:** the buyer pays every fee and rent, about 0.02 SOL ([faucet.solana.com](https://faucet.solana.com)). It also needs the deal amount in Circle devnet USDC ([faucet.circle.com](https://faucet.circle.com)), once: the held deal refunds before the released deal is funded.
  - Circle's faucet gives 20 USDC per request, once every 2 hours per address. The default 25 USDC (the fixture amount) therefore takes two requests. `--amount 20` fits one request, but `fixtures.ts` would have to match, or the API rejects the chain events.
- **Flows:**
  - held: initialize → fund → title hold → rejected release → refund;
  - released: initialize → fund → three approvals → release.

  The parcel is `ohio:39049:230-000918`. Deal IDs are fixed: `sha256("groundtruth-demo-held-v1")` and `sha256("groundtruth-demo-released-v1")`. So the PDAs are known in advance and are registered as the backend's staged deals `staged-devnet-deal` (held) and `staged-devnet-deal-released`. `plan` and `run` refuse if the wallets don't produce those fixtures, and `run` refuses if either PDA already exists on devnet; a second pair needs `-v2` labels. The script checks the deal state and the buyer, vault and seller balances at every settlement.
- **Interrupted runs:** every devnet RPC call retries through rate limits (HTTP 429), and confirmations are polled directly, not through web3's `confirmTransaction`. If a run still stops partway, `run --resume demo-results/devnet-<runId>.json` continues from on-chain state:
  - it skips steps already on chain;
  - it recovers transactions that were sent but never recorded from the deal's history;
  - it keeps only the previous record's signatures that are confirmed on devnet.

  `SOLANA_RPC_URL` points every call at a different RPC.
- **Run of 2026-11-18:** both closings completed; see [`escrow/demo-results/`](../../../escrow/demo-results/README.md).
- **Live deal on stage** (`staged-devnet-deal-live`, 10 test USDC, `sha256("groundtruth-demo-live-v1")`):
  - `demo:deals stage-prep` rehearses both halves locally, then sends initialize, fund, and the title and survey approvals. It never sends the septic approval, so the deal can't be released early.
  - `demo:deals stage-finish`, run on stage, sends the septic approval and the release. It skips the rehearsal to stay fast, and refuses unless the deal is funded with title and survey approved and no hold.
  - Both halves skip steps already on chain, and both write `escrow/demo-results/devnet-stage-live-v1.{json,md}`.
  - `check` reports run, stage-prep, and stage-finish readiness for the live and rehearsal deals, and `simulate` also rehearses both.
- **Rehearsal deal** (`staged-devnet-deal-rehearsal`, 10 test USDC, `sha256("groundtruth-demo-rehearsal-v1")`, PDA `6KQJYssz…mH5u`): a copy of the live deal for practising the stage moment.
  - Run it with `stage-prep --deal staged-devnet-deal-rehearsal`, then `stage-finish --deal staged-devnet-deal-rehearsal`.
  - It has its own PDA and record (`devnet-stage-rehearsal-v1`), so it never consumes the live deal.
  - It can run once. v1 was used up testing the reviewer portal (#45).
- **Rehearsal deal v2** (`staged-devnet-deal-rehearsal-v2`, 10 test USDC, `sha256("groundtruth-demo-rehearsal-v2")`, PDA `EPYNKVUC…J8X`, vault `4awpxEmX…CtpT`): the current rehearsal deal. Use `stage-prep --deal staged-devnet-deal-rehearsal-v2`, then `stage-finish --deal staged-devnet-deal-rehearsal-v2`. Its record is `devnet-stage-rehearsal-v2`. `check` and `simulate` now report on v2.
- **Solana Pay rehearsal deal** (`staged-devnet-deal-pay-rehearsal`, 1 test USDC, `sha256("groundtruth-demo-pay-rehearsal-v1")`, PDA `9zy4EJot…qszL`, vault `a5mZ4Qje…ft3`):
  - `stage-init --deal staged-devnet-deal-pay-rehearsal` (the default deal for `stage-init`) sends `initialize_deal` and nothing else, so the deal stays a draft.
  - The deal page then shows a Solana Pay QR code and link. The buyer's wallet gets the unsigned `fund` from `POST /api/deals/:id/solana-pay/fund`, then signs and sends it.
  - Run on 2026-11-19. The buyer was the staged key, signing through the official `@solana/pay` client, not a wallet app. See [`devnet-solana-pay-fund-v1.md`](../../../escrow/demo-results/devnet-solana-pay-fund-v1.md).
  - It is now funded and can't be funded again. The next rehearsal needs a new label and fixture.
- **Output:** `escrow/demo-results/devnet-<runId>.json` and `.md`, with Explorer links. They are rewritten after every transaction, so a partial run is still recorded. Simulation output is gitignored.
- **Local builds:** `LOCAL_PROGRAM_SO=target/deploy/groundtruth_escrow.so` makes `simulate` run a local build. `run` refuses to start while it (or `ESCROW_PROGRAM_SO`) is set, so its rehearsal always uses the bytecode deployed on devnet.
- **Held release error:** the spec specifies `DealHeld` (6019), and that is the script's default. In the escrow contract (`release.rs`), the `deal.hold.is_none()` check is placed before the `state == Funded` check so that attempting to release a held deal fails with **DealHeld (6019)** as expected. Once upgraded on devnet, both on-chain runs and simulations verify `DealHeld (6019)`. Local simulation against the rebuilt contract can also be run via `LOCAL_PROGRAM_SO=target/deploy/groundtruth_escrow.so pnpm --filter @groundtruth/escrow demo:deals simulate`.

## Depends on

Voice callback and second-device updates are [phase 3](../03-connect-surfaces/ConnectSurfaces.md); use staged signatures until then. Share the deal fixture with [phase 2](../02-parcel-research/ParcelResearch.md) so report and closing point at the same parcel.
