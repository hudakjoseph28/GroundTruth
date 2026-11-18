# GroundTruth Devpost draft

**Tagline:** Know the land. Know what comes next.

**One-sentence pitch:** GroundTruth helps a first-time Ohio land buyer understand a parcel before paying by showing sourced facts, honest gaps, and the person responsible for the next decision.

> Submission note: Keep every `[PENDING]` label until the named owner confirms the integration and supplies the required proof. Remove the label only after that proof is recorded in the repository.
>
> Checked Nov 18, 12:55 p.m. ET ([Readiness.md](Readiness.md)): both demo closings ran on devnet at 12:41 to 12:48 p.m. ET, and every escrow claim below was read back from the public RPC and opened on Solana Explorer. ElevenLabs and QuickNode Streams stay `[PENDING]`. No staged call is recorded. The two closings' timeline rows were backfilled with `replay:devnet`, not delivered by the Stream, so they are not Stream proof. The only QuickNode deliveries are the live stage deal's 4 `stage-prep` transactions, whose webhooks arrived 1–2 s after their blocks. The second-device check is still open.
>
> Updated Nov 18, 2:01 p.m. ET: QuickNode Streams delivered the stage deal's four transactions to the live timeline (below). The two closings above were backfilled with `replay:devnet` and are not Stream deliveries. At that time the API showed the held deal as `refunded` and the released deal still as `draft`; by 2:05 p.m. ET its replay had landed and the API showed it as `released`. ElevenLabs stays `[PENDING]`: no staged call is recorded.

## What it does

Buying vacant land can look simple until the buyer asks basic questions: Can I build here? Can I legally reach the lot? Is sewer service available? Is the person asking for my money authorized to sell it? The answers are scattered across parcel maps, county records, FEMA data, local rules, and professional reviews.

GroundTruth brings that evidence into one buyer-readable report. It shows what a public record supports, what it does not establish, who can resolve the open question, and what the buyer should do next. It is decision support, not a legal buildability opinion, title search, survey, identity service, or deed-transfer system.

The web demo searches live Ohio OGRIP parcels by address or parcel ID and opens each published boundary. The statewide layer covers all 88 counties, and we checked the deployed search in Franklin and Licking counties. The backend also builds live FEMA flood checks in the 83 counties with an NFHL study. Missing or timed-out evidence stays `unknown` instead of becoming a guessed answer.

Our golden parcel is a real 3.015-acre vacant lot in Franklin County. County zoning maps it Rural, but county GIS shows no road right-of-way touching it and the nearest mapped road centerline is about 106 metres away. A title reviewer still has to determine whether a recorded access easement exists. That is the moment we want a first-time buyer to understand: acreage and zoning can look promising while legal access remains unresolved.

The second fixture is a real 1.2-acre vacant parcel in Licking County. Its boundary and FEMA finding are sourced, while the seeded zoning check remains `unknown` because GroundTruth has not integrated and reviewed that local zoning source yet. The report remains useful by naming the township zoning inspector as the next responsible person.

ALTA's 2026 survey of 245 title insurance professionals found that 59% of respondents reported at least one seller-impersonation attempt during 2025, compared with 28% of respondents in ALTA's 2024 survey reporting experience during 2023. Those are respondent-level reports of attempts, including failed attempts. They are not a per-sale probability or a count of successful frauds. This is why GroundTruth treats seller authority as a professional decision rather than a fact inferred from a parcel record.

**Solana escrow:** When the buyer proceeds, staged test USDC sits in a Solana devnet escrow until the staged reviewers sign. We ran both outcomes on devnet on the golden parcel, with staged wallets standing in for the buyer, the seller, and the title, survey, and septic reviewers.

- **A hold blocks the payout.** The buyer funded 25 test USDC. The staged title reviewer signed a hold. A [release was then attempted](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet) and the program rejected it with `DealHeld`: the vault still held 25 and the seller still held 0. The buyer then took a [refund](https://explorer.solana.com/tx/SgPJ9jQCNZfHrp1ipKK3tQ6LYwSaGS9qdhpkshUt8zNJW9JJ2s5V8B9WYuzq5nxLy3sWGvT94ZduEvSDgMzyaSo?cluster=devnet).
- **Cleared sign-offs release it.** On a second deal, the title, survey, and septic reviewers each signed an approval, and the [release](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet) paid exactly 25 test USDC to the bound seller and closed the vault.

**[PENDING] Closing in the product:** The website and API do not show these two outcomes yet. Until they do, the proof is the Explorer links in this document, not a screen in the app.

**[PENDING] ElevenLabs:** The planned owner callback supplies evidence to a staged title reviewer. The call never approves, holds, releases, or refunds a deal by itself. Do not enter the ElevenLabs bounty until the owner confirms a real consenting-participant call, verified webhook delivery, and audible demo footage.

**QuickNode Streams:** A Solana devnet Stream, filtered to our escrow program, sends confirmed program events to a signed webhook that writes them to the buyer's deal timeline. On Nov 18 the stage deal `staged-devnet-deal-live` ([`2UrftJ…F6Cg`](https://explorer.solana.com/address/2UrftJMzbvMngu6Mdg4PhFscqkCHnuLksfbSAiddF6Cg?cluster=devnet)) ran four transactions: initialize [`jmK7fg…pPeE`](https://explorer.solana.com/tx/jmK7fg1PBNa2kYfqbvaDJ3sNWCBSUM4gAbEp529M5QHYeg145EF9RpKGaHKThkZ9PGt2Q9o1jDRFG2ny2GApPeE?cluster=devnet), fund [`5waYrx…PxH5`](https://explorer.solana.com/tx/5waYrx5rD6y7sZttZ73i7H2v1eFyqXvuCkuwxBKC11atb5DQi3CsgHrEyUYrwppxTPPHowg1uxxRejrcaVrJPxH5?cluster=devnet), and the title [`2VSXvY…sFPL`](https://explorer.solana.com/tx/2VSXvYoKQcaHxfK6V8zCFZE9imyBxE8ZF3b8RK7snsP57HxrWdpnYVWUT8puLoZ53bKzvoas2CyuvBUZeRGvsFPL?cluster=devnet) and survey [`Gj327z…M89V`](https://explorer.solana.com/tx/Gj327zRzpfPwqmnTW669iuBQ1DK8e1PTWSMoQKmZcvezZZuZTwFded8mea1bHvHsKLDnfYCBS1w4YikYeNsM89V?cluster=devnet) approvals, in slots 523727603–523727618. All four were applied straight from the Stream, with no replay: the API logged `quicknode applied` for `DealInitialized`, `DealFunded`, and both `ApprovalSigned` events.

![Railway log: four quicknode applied lines for the stage deal](../../proof/quicknode-stage-prep.png)

Railway's HTTP log shows each webhook arriving 1–2 s after its block (18:57:20–18:57:24 UTC). The 1.8–3.3 s first measured on the deal timeline came from polling the timeline API every 1.5 s against whole-second block times, so it includes up to 1.5 s of polling delay. The screenshot's app-log lines are all stamped 13:57:29 EST; the arrival times come from the HTTP log, which is not in the repo.

The two closings above are not Stream deliveries: their timeline rows were backfilled with `replay:devnet`, because QuickNode backfill needs a paid plan. **[PENDING]** Measure the update on a second device before entering the Streams bounty.

## How we built it

We built GroundTruth as a pnpm workspace with one shared TypeScript contract. The React web app renders the search flow, parcel boundary, evidence cards, 3D land view, and staged closing interface. The Express API owns public-data access so the browser never talks directly to OGRIP, FEMA, PostgreSQL, or a provider that needs a secret.

For parcel discovery, the backend queries Ohio's statewide OGRIP parcel FeatureServer. Parcel IDs are normalized without changing the published local ID, and address search uses Ohio's LBRS locator with a bounded site-address fallback. The API returns the published geometry, source URL, and retrieval time.

For reports, each evidence check runs independently. The live pipeline currently combines the OGRIP parcel with FEMA's National Flood Hazard Layer. A provider miss, timeout, or uncovered county becomes an explicit `unknown` check with a responsible party and next action. The manually verified Franklin fixture adds county zoning, the zoning resolution, the Auditor's legal acreage, county right-of-way and road layers, and the Big Darby riparian-setback layer. The Licking fixture deliberately demonstrates a partial report.

Prisma maps the shared contract into PostgreSQL for seeded and cached reports. The API exposes health, parcel search, parcel detail, report, coverage, staged deal, and timeline routes. Tests replay recorded public-provider responses so the normal, missing-data, and timeout paths remain reproducible without inventing facts.

The web is built with React, Vite, TypeScript, Three.js, and react-globe.gl. The API uses Node.js, Express, Zod, Prisma, and PostgreSQL. Vercel hosts the web deployment and Railway hosts the API and database documented in the repository.

**Escrow program on devnet:** The Rust and Anchor escrow program is deployed to Solana devnet as [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet) ([deploy transaction](https://explorer.solana.com/tx/4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU?cluster=devnet)). Its published Anchor IDL ([metadata account](https://explorer.solana.com/address/uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma?cluster=devnet)) is identical to the IDL our backend decodes events with.

**Escrow outcomes on devnet (Nov 18, 2026):** Both deals use the golden parcel, 25 test USDC (Circle's devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), and the same staged wallets. Every transaction below is finalized.

Held deal, [`54Va6q…E4tW`](https://explorer.solana.com/address/54Va6qKNQTsbuXTqi4tXaPVgdkQh4S7McsCKsjKPE4tW?cluster=devnet):

| Step | Transaction | Buyer | Vault | Seller |
| --- | --- | --- | --- | --- |
| Initialize | [`4ZscUV…KjNv`](https://explorer.solana.com/tx/4ZscUVnfZ3W5ukt7H8tSBrQZNrvY5Hu3Qq9oRNJeTbHj61UvwcPAAssZJ4DtaxzeVQAb2rcFPYyRGWsQuaoPKjNv?cluster=devnet) | 40 | 0 | 0 |
| Fund | [`grkKU9…dd74`](https://explorer.solana.com/tx/grkKU9YqV1xpAkHySCjdhLgavpd5dW3mJsvbiZ1tjEyvuHC9T373Hmscubsm8UapaA7j93pHrseJMepw1C3dd74?cluster=devnet) | 15 | 25 | 0 |
| Title reviewer places hold | [`5QovFT…J2ib`](https://explorer.solana.com/tx/5QovFTbAMquUY5M5NpJwZPUJhtcKAcmQ5xmZhvFWT46KfPh3UBkaQMhgQhcuphBqvTiYLUgTmNNS7b8tyR7JJ2ib?cluster=devnet) | 15 | 25 | 0 |
| Release attempted: **rejected**, `DealHeld` (6019) | [`Rro8WA…vwGz`](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet) | 15 | 25 | 0 |
| Buyer refund | [`SgPJ9j…yaSo`](https://explorer.solana.com/tx/SgPJ9jQCNZfHrp1ipKK3tQ6LYwSaGS9qdhpkshUt8zNJW9JJ2s5V8B9WYuzq5nxLy3sWGvT94ZduEvSDgMzyaSo?cluster=devnet) | 40 | closed | 0 |

Released deal, [`3uBECm…2yu`](https://explorer.solana.com/address/3uBECmkG9XKbJbGisPjqWNxy6Sb3knVZ2cnwF7jby2yu?cluster=devnet):

| Step | Transaction | Buyer | Vault | Seller |
| --- | --- | --- | --- | --- |
| Initialize | [`ZFo3g3…hM9M`](https://explorer.solana.com/tx/ZFo3g36XTKCaVkLJKpgD2S2sGf4zqNVp3tsFkpSPeJ9mNyfJbWCHtjPDbAV8oUvdXGZs7Ag7n9jTxGbRhh2hM9M?cluster=devnet) | 40 | 0 | 0 |
| Fund | [`4a2HxS…txgR`](https://explorer.solana.com/tx/4a2HxSta9rKio7BsFMVzTvKfA9yBBSzr9uFzJEtDDNG3wJi7hzsJCgkM8SuCt3qQfkUCg4VUM8VCwxHykhDwtxgR?cluster=devnet) | 15 | 25 | 0 |
| Three reviewer approvals | [`5Rnsas…jBqt`](https://explorer.solana.com/tx/5Rnsas4nLpLJM8ss63dB2768wbTRJteEWBMCE7Z4njzE1JNk547WQ7nQdp38W8Go25tX2YsQtvvn5nRNdEV5jBqt?cluster=devnet) · [`3D8ahB…jL9P`](https://explorer.solana.com/tx/3D8ahBLYuhCiZfNZcMgQZZ3UQnHeoNcBFCgu9NLbyao1TZUMCKBn4RjWcKYJhQupNiZy1JiXnyN8UUARFM57jL9P?cluster=devnet) · [`7tnvjT…S2fb`](https://explorer.solana.com/tx/7tnvjTxYw6vu7xFKCDTJ4fJGjerS6SCJ3QfSkFn3N916bXaBVEmBnrYwrF9hHSFyCurox1Kct9YdcJGxm4XS2fb?cluster=devnet) | 15 | 25 | 0 |
| Release to the bound seller | [`5kWpcH…vHdC`](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet) | 15 | closed | 25 |

Balances are test USDC after each step, read from the transactions' token balances on the public devnet RPC. Where a step does not touch an account, its value is carried from the steps on either side. The rejected release's log reads: "Error Code: DealHeld. Error Number: 6019. Error Message: Cannot release funds while deal is under active hold."

Not shown on devnet: a second release attempt on the released deal. The vault is closed, and the local test suite covers repeated settlement.

**Sponsor integrations:** QuickNode Streams delivered the stage deal's four transactions to the live timeline (see above). The two closings' timeline rows came from `replay:devnet`, not the Stream. **[PENDING]** ElevenLabs stays a planned integration until its owner confirms a staged call: the webhook is deployed and rejects unsigned requests, but no call is recorded.

## Challenges we ran into

The hardest product challenge was resisting a confident answer when the records did not support one. A parcel boundary can show that a lot is near a road, but it cannot prove a legal right of access. A tax land-use class is not zoning. Zone X means minimal mapped flood hazard, not zero flood risk. We had to make those limitations useful instead of hiding them in fine print.

Ohio's statewide parcel layer gives us broad discovery, but local evidence is fragmented. Counties use different parcel-ID formats, addresses are inconsistent, vacant lots may have no house number, and local zoning or utility data may live in a separate system. We built normalization and failure states around those differences instead of pretending every county has the same depth.

External services also fail in ordinary ways. OGRIP or FEMA can time out, return no match, or omit a county study. We designed the report so one failed check does not erase the evidence that did return, and so a timeout never turns into a positive or negative land-use conclusion.

Finally, we had to keep three kinds of truth separate: a public record supplies evidence, a qualified reviewer makes a decision, and a payment system enforces where money moves. Blurring those roles would make the demo simpler, but the product less trustworthy.

## Accomplishments that we're proud of

- We search real OGRIP parcel data through the backend for all 88 Ohio counties and preserve the published parcel IDs and boundaries.
- We tested the full search, boundary, and report path in Franklin and Licking counties rather than presenting an invented sample.
- We built live FEMA flood checks for the 83 Ohio counties with an NFHL study and return an honest `unknown` state for the five without one.
- We created a deeply sourced Franklin County golden report with zoning and flood evidence, a legal-access review flag, dated sources, and a named next actor.
- We created a second-county report that stays useful when a local check is not integrated instead of filling the gap with a fallback value.
- We handle provider timeouts without guessing, and recorded tests cover parcel-ID variations, addresses, missing parcels, flood-zone combinations, and missing FEMA studies.
- We built a responsive buyer experience with real parcel geometry, baked aerial imagery and elevation for the staged parcels, and clear evidence and limitation states.

- We ran both closings on Solana devnet: a reviewer's hold made the program reject a release with the vault balance unchanged, and three reviewer approvals released exactly 25 test USDC to the bound seller. Each step has an Explorer link above.

- QuickNode Streams delivered four confirmed escrow transactions from devnet to our webhook 1–2 s after their blocks, with no replay ([Railway log](../../proof/quicknode-stage-prep.png)).

**[PENDING] Do not add ElevenLabs to this accomplishments list until its owner confirms the required proof.**

## What we learned

We learned that `unknown` can be a useful product result. A buyer does not need false certainty. They need to know what is missing, why it matters, and who can resolve it.

We also learned that broad coverage and deep coverage are different measurements. OGRIP gives us statewide parcel discovery, while zoning, access, utilities, and septic evidence depend on the local authority. GroundTruth should show both measurements instead of turning one verified county into a statewide claim.

The most important design lesson was to keep evidence, professional judgment, and payment enforcement separate. Public records can narrow the question. A title reviewer, surveyor, zoning official, or health authority resolves it. A payment system can then enforce the signed conditions, but it cannot decide whether the land is buildable or whether a seller is legitimate.

## What's next for GroundTruth

Our immediate product step is to add verified local zoning and access adapters behind the same report contract, county by county, without weakening the `unknown` state. Statewide search is live today, but only Franklin County has a zoning check.

We will test the report with first-time land buyers and title or closing professionals. The pilot questions are practical: Can a buyer explain the biggest open issue? Do they know who acts next? Does the report help them pause, negotiate, or walk away before sending money?

- **[PENDING] Closing in the product:** the held, refunded, and released outcomes are on devnet with their links above. Still show them in the website's deal view and the API timeline.
- **[PENDING] QuickNode Streams:** measure the timeline update on a second device, and deliver the stage deal's septic approval and release through the Stream.
- **[PENDING] ElevenLabs:** confirm a real staged callback with a consenting teammate, verified webhook evidence, reviewer handoff, and audible video footage.
- Add authenticated, private evidence handling before any real buyer, seller, identity, title, or call data enters the product.
- Work with a title or closing partner to define production approval, hold, release, and refund terms. The hackathon workflow is a staged prototype, not a production closing service.

## Technologies used

### Working on `main`

- Rust and Anchor: the escrow program is deployed to Solana devnet (see the program link above)
- Solana devnet escrow deals: SPL Token transfers of Circle test USDC (two deals run, links above)
- TypeScript and pnpm workspaces
- React, Vite, Three.js, and react-globe.gl
- Node.js, Express, and Zod
- Prisma and PostgreSQL
- Ohio OGRIP statewide parcels and LBRS address locator through ArcGIS REST services
- FEMA National Flood Hazard Layer
- Franklin County Auditor, zoning, road right-of-way, road-section, and stream-buffer sources for the verified golden parcel
- Vitest and Supertest
- Vercel and Railway deployment configuration
- QuickNode Streams: live delivery of the stage deal's four transactions to the deal timeline (second-device update not yet measured)

### Awaiting owner confirmation

- **[PENDING]** ElevenLabs
