# GroundTruth · Reference builds

**Design references for the weekend build.** Four earlier projects show patterns worth adapting. Each section records the upstream behavior, the part that transfers, and one acceptance check. Implement those patterns in original code. UBC requires submitted work to be created during the event, so a useful reference is still ineligible to copy. Upstream license permission and competition eligibility are separate questions. [UBC rules][rules] · [GitHub licensing][github-license]

This pass re-read the Terra-Zone and Accord sources at the commits below. SolMail’s file locations were confirmed at the pinned Android commit. The SOLstice excerpt is carried from the prior static review and could not be matched to a public commit on November 12, 2026. Applications and transactions were not run.

## Where to start

| Build question | Read first | Carry into GroundTruth |
| --- | --- | --- |
| How does off-chain evidence become an on-chain payment decision? | [SOLstice](#solstice) | Keep the report, the signed decision, and settlement as separate steps. A server request is evidence, and the assigned reviewers’ signatures are the approval. |
| How do we hold and release USDC? | [Accord](#accord) | Use a deal-scoped SPL token vault. Check the mint and both destinations. Assert balances on both sides in base units. |
| How does a parcel on a map become a report? | [Terra-Zone](#terra-zone) | Run independent lookups, then render a report from the evidence that actually returned. |
| How do web, mobile, and an agent share a workflow? | [SolMail](#solmail) | Share the backend and the deal identity. Give the phone its own UI. Keep agent output advisory. |

The [UBC brief](../ubc/UBC-Hackathon.md) already cites SolMail as a pitch precedent: a familiar action can make a condition visible beside the money. This file uses the same project only as a code reference for the phone and the agent boundary.

## SOLstice

A Next.js and Anchor demo, described in the prior review, releases native Devnet SOL when a real-world condition is satisfied. Its construction example is close to our closing story. The prior review found a configured verifier, a fixed recipient, and a release path that submits a hard-coded approval. No public repository containing the excerpt below turned up in this pass, and the reviewed tree had no license grant. Treat the excerpt as a lead. Pin the commit before anyone uses it as an interface.

**Prior-review excerpt.** The program checks stored state before releasing funds:

```rust
require!(deal.funded, EscrowError::NotFunded);
require!(deal.has_result, EscrowError::MissingConditionResult);
require!(deal.condition_result, EscrowError::ConditionFalse);
require!(!deal.released, EscrowError::AlreadyReleased);
```

**What transfers.** Release rules belong in the program. The UI can explain readiness, and Solana enforces it. GroundTruth keeps that separation and replaces the single boolean with the sign-offs assigned to that deal, plus a dispute hold. An ElevenLabs call can supply evidence. The assigned reviewer signs the hold or the approval from their wallet. A disputed result has a refund path defined beside release. The buyer should be able to tell three states apart: evidence received, reviewer decision signed, and funds still held or settled.

| Prior-review finding | GroundTruth behavior |
| --- | --- |
| The server plans checks, fetches public snippets, and asks a model to judge them. Document metadata cannot satisfy a document check. | Use source-specific parcel lookups and an evidence status per check. Keep title evidence and call contents private. |
| The release route submits a hard-coded true result with the server verifier. It does not read the verification record or check deal membership. The program checks the configured signer and condition ID. | Show readiness in the UI. Move funds only when the program sees the assigned reviewers’ signatures, no active hold, and the bound destination. |
| The app tracks submitted, confirmed, and failed states. The browser can open a fresh escrow after the linked demo deal has settled. Tests include negative cases and a recipient balance check. Local tests are distinct from Devnet execution. | Keep a private buyer view of confirmed chain state. Reconcile an uncertain submission against that same deal. A fresh deal is an explicit demo reset. |

**Acceptance check.** An unresolved or disputed deal stays funded after release is rejected. A cleared deal pays the bound recipient once. Refreshing the page shows the same deal and the same receipt.

**Leave behind.** Native SOL transfers, a single server verifier, and any route that turns a client request into a positive approval. Accord is the vault reference. The prior review found no refund instruction in the SOLstice program.

## Terra-Zone

A React and MapLibre feasibility prototype. The map sends a polygon to Supabase Edge Functions that collect geospatial inputs, estimate cost, and ask a model for a structured summary. HackPrinceton submission. Reviewed at [`16eb25a`](https://github.com/rakeshcr92/terrazone/commit/16eb25a9915bf5afeeccbbe6162c358fbdafd62b). The README includes an MIT notice. [Devpost](https://devpost.com/software/terra-zone) · [MIT notice](https://github.com/rakeshcr92/terrazone/blob/16eb25a9915bf5afeeccbbe6162c358fbdafd62b/README.md)

**Source excerpt.** The geological function starts independent lookups together:

```ts
const [elevationData, soilData, waterData] = await Promise.all([
  fetchElevationData(lat, lng),
  fetchUSDAsoilData(lat, lng),
  fetchUSGSWaterData(lat, lng)
]);
```

[Geological provider fan-out](https://github.com/rakeshcr92/terrazone/blob/16eb25a9915bf5afeeccbbe6162c358fbdafd62b/supabase/functions/geological-data/index.ts)

**What transfers.** Independent lookups can run together, so one slow provider does not stall the others. Each GroundTruth call gets a timeout and its own outcome. A miss, a timeout, or a county without coverage leaves that check unresolved, and the report still renders the findings that came back. Spatial facts come from trusted geometry. The model summarizes only the evidence supplied to it.

| Code path | What the reviewed code does | GroundTruth behavior |
| --- | --- | --- |
| Map callbacks → analysis page | The client captures a drawn polygon, computes its area, and renders progress. The decision engine prefers a supplied frontend area when one is present. | Start from a selected cadastral parcel and draw its published boundary. Facts in the report use source geometry or a server-side calculation. |
| Decision engine and zoning function | Both choose a Princeton zoning row by hashing latitude and longitude: `Math.abs(Math.floor((lng + lat) * 10000))`. The zoning function also waits 1.5 seconds to simulate retrieval. These selectors are not spatial joins. | Resolve the responsible jurisdiction. Intersect the parcel with published zoning geometry where that geometry exists. Flag parcels that span districts and locations without usable coverage. Keep the source label on the finding. |
| Geology function → summary fallback | Failed calls return simulated elevation, soil, and water values. The decision engine also builds a fallback summary when model output is missing, and its prompt asks for exact measured figures. It logs portions of raw request or model payloads. | Render the known evidence and name the gap. An unresolved check stays unresolved. Allowlist public fields before model input. Log source status and timing. |

**Acceptance check.** Open parcels in different Ohio counties. When a local zoning source is unavailable, the report still shows the mapped parcel and the findings that have support, and it names what would resolve zoning.

**Leave behind.** Drawn stand-in parcels, coordinate-hash zoning, simulated measurements, and a GO / NO-GO investment verdict. The useful piece is the interaction and the report pipeline. Start with the Ohio OGRIP public layer for parcel IDs and geometry, and allowlist fields so mailing addresses stay out of the public report. Measure search coverage and report depth separately. [Ohio OGRIP public layer](https://ohioparcels-geohio.hub.arcgis.com/)

## Accord

A freelance escrow prototype with an Anchor program, a Next.js frontend, and separate local and Devnet runners. It handles SPL token deposits, payout, cancellation, expiry, and a jury dispute flow. The job PDA is the authority over the token vault. Reviewed at [`da8ad07`](https://github.com/Heinrich-Kemler/solwork-hackathon/commit/da8ad071703db4675fef8990f1597f8734142159). No license grant appeared in the repository metadata or README. [Repository](https://github.com/Heinrich-Kemler/solwork-hackathon)

**Source excerpt.** Two checks from the successful-settlement test:

```ts
assert.equal(happyVaultAfter, BigInt(0));
assert.equal(freelancerAfterHappy - freelancerBeforeHappy, freelancerExpectedHappy);
```

[Local integration runner](https://github.com/Heinrich-Kemler/solwork-hackathon/blob/da8ad071703db4675fef8990f1597f8734142159/tests/local-runner.ts)

**What transfers.** Those assertions turn a “Paid” screen into evidence that the correct token balances changed. GroundTruth records integer base units before and after each demo. A blocked payout changes neither the seller balance nor the vault balance. A cleared payout pays the bound seller the exact agreed amount, and the vault ends at zero. A refund returns that amount to the buyer. The payout and refund destinations are bound to the deal before funding.

The same test also shows why the amounts differ from ours. `freelancerExpectedHappy` is the deposit minus a 1% fee and a 0.5% referral. GroundTruth’s demo seller receives the full agreed amount. Accord’s `claim_after_grace` path pays the worker when the client is silent. In GroundTruth, missing signatures or an active hold leave the vault unchanged.

| Code path | What the reviewed code does | GroundTruth behavior |
| --- | --- | --- |
| Create-job accounts → deposit | The program creates a job-scoped token vault, binds it to the configured mint and job authority, and moves funds from the client’s token account. | Bind the buyer, the seller payout, the assigned reviewers, and the USDC mint to each deal before funding. |
| Release, expiry, and refund | Release checks job state and the expected recipient. Expiry and grace each return or pay the balance under their own rules. The job model also includes fees, referrals, tranches, and jury settlement. | Write GroundTruth’s own roles and refund policy. Test missing approval, an active hold, the wrong mint, the wrong destination, an authorized refund, and a repeated settlement. |
| Mint check and runners | The normal mint check expects Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. A local-testing feature permits a test mint. Local tests check balances. The Devnet smoke script checks a successful flow and final job status. | Run local negative tests and balance tests, then a small Devnet pass with Circle test USDC. Save the transaction signatures and verify both balances for the held case and the released case. |

The Solana Foundation Anchor escrow example is a second reference for PDA vault plumbing. Its business logic is a token swap, so it stops at the account relationship.

**Acceptance check.** Record vault, buyer, and seller balances before and after a blocked payout, an authorized refund, and a clean payout. A second settlement fails.

## SolMail

A web and Android product that associates a paid email thread with a Solana escrow. The Android app uses Expo and Mobile Wallet Adapter, with a tRPC client into the Zero backend. The repo includes native-SOL program variants and a server agent that can score a reply and initiate settlement. Android tree reviewed at [`69d7e9b`](https://github.com/sol-mail/solmail-android/commit/69d7e9b1e65ae34d2d6d2232050eb548ddafa163). [Android repository](https://github.com/sol-mail/solmail-android) · [Web repository](https://github.com/hrishabhayush/email.sol)

**Prior-review excerpt.** The phone attaches its session to a shared API request, from `solmail-android/src/api/trpc.ts` at that commit:

```ts
const token = await getMobileToken();
const headers = new Headers(options?.headers);
if (token) {
  headers.set('Authorization', `Bearer ${token}`);
}
```

**What transfers.** The phone can use the same backend as the website and keep its own navigation. A buyer can research on the web, open an HTTPS deal link on the phone, and see the same closing status after authenticating. That works with a shared deal API before native signing exists. The agent can evaluate evidence and record a review outcome. A separate authorized path decides what happens to the money. Mobile signing stays optional for the demo. Live phone updates come from confirmed chain events.

| Code path | What the prior review and repo layout show | GroundTruth behavior |
| --- | --- | --- |
| Mobile API client and wallet provider | The mobile client calls a configured shared backend. Wallet authorization is stored separately from the application session. | Keep the application session and wallet authorization distinct. The QR carries a deal URL. The server checks that the signed-in account can open that deal. |
| Compose path and native program | Compose builds instructions with hard-coded discriminators. In the inspected native program, the receiver is assigned at claim time. | Bind GroundTruth’s payout wallet when the deal is created. Use a client generated from our program interface. For an iPhone demo, show status and alerts while signing on the tested web wallet. |
| Agent runner | The Devpost submission says the agent evaluates a reply and triggers escrow release or refund. The Android tree contains that agent under `Zero/apps/server/src/routes/agent/`. The prior review also found a mainnet RPC default when no endpoint is configured, and a mobile funding path that uses Devnet and a different program interface. | Configure Devnet explicitly. Treat voice or model output as evidence for the reviewer. Reviewer signing and settlement stay separate. |

**Acceptance check.** Open the deal link on a phone. The authorized account sees a reviewer approval arrive through the confirmed chain update. A different account receives no private deal data.

**Leave behind.** The email score policy, the contract variants, and any agent wallet that can settle. The web and Android READMEs point at Zero’s MIT license in `Zero/LICENSE`. The Android repository’s GitHub license field is empty. Check that notice against any file outside the Zero subtree before reuse.

## How the references become the build

The weekend order is in [phases](../phases/README.md): escrow and parcel research run together, then the two surfaces connect, then the team chooses the pitch from the working demo.

Confirm the organizer’s reading of the original-work rule before any external project code enters the submission. Sample code from these repositories stays in this review until its license and eligibility are both settled.

[rules]: https://ubc-hackathon-2026.devpost.com/rules
[github-license]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
