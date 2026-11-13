# GroundTruth · Reference builds

**Use this file to avoid known mistakes, not to design from scratch.** The accepted GroundTruth interfaces are in [DataContract](../architecture/DataContract.md), the system boundary is in [Architecture](../architecture/Architecture.md), and the stack is in [Decisions](../architecture/Decisions.md). If a reference conflicts with any of those, GroundTruth wins.

> **TL;DR** Four earlier projects show patterns worth adapting. **We write original code**: UBC requires submitted work to be created during the event, so a reference is never a paste source, and upstream license permission and competition eligibility are separate questions. [UBC rules][rules] · [GitHub licensing][github-license]
>
> | Question | Read | What we take |
> | --- | --- | --- |
> | Off-chain evidence → on-chain payment decision? | [SOLstice](#solstice) | Report, signed decision, settlement are separate steps. A server request is evidence; reviewer signatures are the approval. |
> | Hold and release USDC? | [Accord](#accord) | Deal-scoped SPL token vault. Check mint and both destinations. Assert balances in base units. |
> | Parcel on a map → report? | [Terra-Zone](#terra-zone) | Independent lookups; report only the evidence that returned. |
> | Web, mobile, and agent on one workflow? | [SolMail](#solmail) | Shared backend and deal identity, phone-specific UI, advisory-only agent. |

**Review status (Nov 12, 2026):** Terra-Zone and Accord re-read at the commits below; SolMail file locations confirmed at the pinned Android commit; the SOLstice excerpt is from a prior static review and couldn't be matched to a public commit. No apps or transactions were run.

## Decisions already extracted

| Pattern | GroundTruth decision | Where it is enforced |
| --- | --- | --- |
| Independent geospatial lookups | Each adapter returns found/missing/timeout/conflict; partial report still renders | Parcel API + [Phase 2](../phases/02-parcel-research/ParcelResearch.md) |
| Deal-scoped token vault | Buyer, seller ATA, mint, amount, and reviewer set are immutable after initialization | Anchor account constraints + [Escrow v1](../architecture/DataContract.md#escrow-v1) |
| Advisory agent | Voice/model output creates private evidence; only a bound reviewer signs a hold or approval | API boundary + program signer checks |
| Shared deal identity | Desktop and phone-sized layouts open the same public staged deal route | Responsive web + v1 `Deal` |

Do not spend hackathon time re-reviewing these repositories unless an implementation is blocked on a specific pattern. Never import code from an unlicensed or eligibility-unclear source.

## SOLstice

Next.js + Anchor demo (per the prior review) that releases native devnet SOL when a real-world condition is met; its construction example is close to our closing story. The prior review found a configured verifier, a fixed recipient, and a release route that submits a hard-coded `true` without reading the verification record or checking deal membership. No public repo with the excerpt turned up and the reviewed tree had no license grant. **A lead only: pin a commit before using it as an interface.**

```rust
require!(deal.funded, EscrowError::NotFunded);
require!(deal.has_result, EscrowError::MissingConditionResult);
require!(deal.condition_result, EscrowError::ConditionFalse);
require!(!deal.released, EscrowError::AlreadyReleased);
```

- **Take:** release rules live in the program; the UI explains readiness and Solana enforces it. GroundTruth uses assigned sign-offs plus a terminal dispute hold. Release is permissionless only after every required approval and can pay only the bound seller; the buyer can refund only while held. Use source-specific lookups with an evidence status per check, not a model judging web snippets. Two independent demo deals preserve both receipts.
- **Leave:** native SOL, a single server verifier, any route that turns a client request into an approval. It has no refund instruction; Accord is our vault reference.
- **Check:** a disputed deal stays funded after release is rejected; a cleared deal pays the bound recipient once; refresh shows the same deal and receipt.

## Terra-Zone

React + MapLibre feasibility prototype (HackPrinceton): a drawn polygon goes to Supabase Edge Functions that collect geospatial inputs, estimate cost, and ask a model for a summary. Reviewed at [`16eb25a`](https://github.com/rakeshcr92/terrazone/commit/16eb25a9915bf5afeeccbbe6162c358fbdafd62b); README includes an MIT notice. [Devpost](https://devpost.com/software/terra-zone) · [MIT notice](https://github.com/rakeshcr92/terrazone/blob/16eb25a9915bf5afeeccbbe6162c358fbdafd62b/README.md)

```ts
const [elevationData, soilData, waterData] = await Promise.all([
  fetchElevationData(lat, lng),
  fetchUSDAsoilData(lat, lng),
  fetchUSGSWaterData(lat, lng)
]);
```

[Geological provider fan-out](https://github.com/rakeshcr92/terrazone/blob/16eb25a9915bf5afeeccbbe6162c358fbdafd62b/supabase/functions/geological-data/index.ts)

- **Take:** parallel lookups, each with its own timeout and outcome. A miss, timeout, or uncovered county leaves that check unresolved while the report still renders. Spatial facts from source geometry; the model summarizes only what it's given.
- **Leave:** the drawn stand-in polygon and preference for a frontend-supplied area; zoning picked by hashing coordinates (`Math.abs(Math.floor((lng + lat) * 10000))`) after a fake 1.5 s wait, which is not a spatial join; simulated elevation/soil/water fallbacks and fallback summaries; logging raw payloads; the GO / NO-GO verdict.
- **Instead:** start from the [Ohio OGRIP public layer](https://ohioparcels-geohio.hub.arcgis.com/); resolve the jurisdiction and intersect published zoning geometry; flag multi-district parcels; allowlist fields so mailing addresses never reach the report or model; measure search coverage and report depth separately.
- **Check:** parcels in different Ohio counties open; with local zoning down, the report still shows the parcel and supported findings and names what resolves zoning.

## Accord

Freelance escrow prototype: Anchor program, Next.js frontend, local and devnet runners; SPL deposits, payout, cancellation, expiry, jury disputes; the job PDA owns the vault. Reviewed at [`da8ad07`](https://github.com/Heinrich-Kemler/solwork-hackathon/commit/da8ad071703db4675fef8990f1597f8734142159). No license grant in metadata or README. [Repository](https://github.com/Heinrich-Kemler/solwork-hackathon)

```ts
assert.equal(happyVaultAfter, BigInt(0));
assert.equal(freelancerAfterHappy - freelancerBeforeHappy, freelancerExpectedHappy);
```

[Local integration runner](https://github.com/Heinrich-Kemler/solwork-hackathon/blob/da8ad071703db4675fef8990f1597f8734142159/tests/local-runner.ts)

- **Take:** balance assertions turn a "Paid" screen into proof. Record base units before and after every action: a blocked payout changes neither seller nor vault; a cleared payout pays the exact amount and empties the vault; a refund returns it to the buyer. Bind buyer, seller payout, reviewers, and mint before funding. Its mint check expects devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (a local feature allows a test mint).
- **Leave:** `freelancerExpectedHappy` is the deposit minus a 1% fee and 0.5% referral; our seller gets the full amount. `claim_after_grace` pays on client silence; for us, missing signatures or a hold leave the vault unchanged. No tranches, no jury.
- **Test:** missing approval, active hold, wrong mint, wrong destination, authorized refund, repeated settlement locally; then a small devnet pass with Circle test USDC, saving signatures.
- The Solana Foundation Anchor escrow example is a second reference for PDA vault plumbing only (its logic is a token swap).
- **Check:** vault, buyer, and seller balances before and after a blocked payout, an authorized refund, and a clean payout. A second settlement fails.

## SolMail

Web + Android product tying a paid email thread to a Solana escrow. Android uses Expo and Mobile Wallet Adapter with a tRPC client into the Zero backend; the repo has native-SOL program variants and a server agent (`Zero/apps/server/src/routes/agent/`) that scores replies and triggers release or refund. Android tree reviewed at [`69d7e9b`](https://github.com/sol-mail/solmail-android/commit/69d7e9b1e65ae34d2d6d2232050eb548ddafa163). [Android repository](https://github.com/sol-mail/solmail-android) · [Web repository](https://github.com/hrishabhayush/email.sol)

Prior-review excerpt, `solmail-android/src/api/trpc.ts` at that commit:

```ts
const token = await getMobileToken();
const headers = new Headers(options?.headers);
if (token) {
  headers.set('Authorization', `Bearer ${token}`);
}
```

- **Take:** desktop and phone-sized layouts use the same backend and deal identity. The QR carries the public staged deal URL; wallet authorization remains distinct from viewing. Live updates come from confirmed chain events.
- **Leave:** hard-coded instruction discriminators (use a client generated from our program); a receiver assigned at claim time (we bind payout at creation); the email score policy; contract variants; any agent wallet that can settle; the mainnet RPC default when unset (configure devnet explicitly). Voice/model output is evidence for the reviewer only.
- **License:** web and Android READMEs point to Zero's MIT license in `Zero/LICENSE`; the Android repo's GitHub license field is empty. Check it for anything outside the Zero subtree.
- **Check:** on a phone-sized browser, the staged deal shows amount, confirmed reviewer update, and next action without exposing private evidence or enabling an unbound wallet to act.

The [UBC brief](../ubc/UBC-Hackathon.md) also cites SolMail as a pitch precedent. Build order is in [phases](../phases/README.md). Confirm the organizer's reading of the original-work rule before any external code enters the submission.

[rules]: https://ubc-hackathon-2026.devpost.com/rules
[github-license]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
