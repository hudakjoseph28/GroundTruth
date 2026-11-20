<!--
Final Devpost text for GroundTruth (UBC 2026). Copy each "##" section into the matching Devpost field.

Two web tests read this file, so edit it together with the files they compare it to:
- frontend/web/src/pages/RoadmapPage.test.tsx: "What's next for GroundTruth" (up to "Technologies used") must contain every card in frontend/web/src/content/roadmap.ts word for word.
- frontend/web/src/content/proof.test.ts: every link and quoted value on /proof must appear in this file or QA-Proof.md, and the balance tables must match row for row.

A quoted note that starts "Needs a Railway key" marks a feature that is built and merged but switched off on the live API until that key is set. Delete the note once the key is set and the feature answers on the live site.
-->

# GroundTruth

**Know the land before the money moves.**

[Live app](https://groundtruth-lac.vercel.app) · [Proof page](https://groundtruth-lac.vercel.app/proof) · [Walkthrough](https://groundtruth-lac.vercel.app/walkthrough) · [GitHub](https://github.com/hudakjoseph28/GroundTruth)

Solana devnet receipts: [a hold blocks the payout (`DealHeld`)](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet) · [the buyer's refund](https://explorer.solana.com/tx/SgPJ9jQCNZfHrp1ipKK3tQ6LYwSaGS9qdhpkshUt8zNJW9JJ2s5V8B9WYuzq5nxLy3sWGvT94ZduEvSDgMzyaSo?cluster=devnet) · [the release to the seller](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet)

GroundTruth helps a first-time buyer of vacant land in Ohio see what the public records actually say about a lot, and what they don't, before paying. Then it keeps the deposit in a Solana escrow that releases only when the right professionals sign off.

## Inspiration

One of us grew up hearing family friends talk about buying a cheap lot "out in the country" and building on it someday. When we looked into what that actually takes, it got scary fast. A listing can say "3 acres, great building site" while the county records say no road touches the lot, the soil can't handle a septic system, and part of it sits in a stream setback. None of that is hidden, exactly. It's just spread across a dozen county, state and federal websites that a first-time buyer has never heard of.

Then there's fraud. Vacant land is the easiest thing in real estate to steal, because nobody lives there to notice. Scammers pose as the owner, push for a quick sale, and disappear with the deposit. In ALTA's 2026 survey of 245 title insurance professionals, 59% reported at least one seller-impersonation attempt in 2025, up from 28% in ALTA's 2024 survey (for 2023). Those are reports of attempts, including failed ones, not a rate per sale. 82% rated vacant land at least somewhat common in this kind of fraud, the highest of any property type. The FBI's IC3 issued a warning about vacant-parcel seller impersonation in June 2026.

So we asked a simple question: what if a buyer could see what the records actually say about a lot, and what if their deposit couldn't move until the right professionals signed off?

## What it does

**Start with a real lot.** Parcel 230-000918 in Franklin County, Ohio, is a vacant lot of 3.015 acres according to the county auditor. The county's zoning map puts all of it in the Rural district, which allows a one-family home on 2.5 acres or more. FEMA maps it in Zone X, minimal mapped flood hazard. On paper it looks like a building site.

GroundTruth flags what that listing wouldn't tell you. **No road right-of-way touches the lot** in the county's right-of-way layer. The nearest mapped road, Seaman Rd, is about 107 m away, and the auditor lists the parcel as "SEAMAN RD REAR". Rural zoning requires 150 feet of frontage on a public street or an approved private street. So the first thing the report asks is whether legal access exists, and it names who can answer: a title reviewer looking for a recorded easement, and county zoning. It also shows that all three soil types on the lot are rated "Very limited" for a septic absorption field, and it sends the buyer to Franklin County Public Health for a site evaluation. Acreage and zoning look promising. Access is still an open question.

**What a buyer can do today:**

- **Find any Ohio parcel** by address, street or parcel ID, using the state's OGRIP boundaries for all 88 counties. You can type `010042534` and still land on Franklin's `010-042534`.
- **See the land in 3D** on aerial imagery and terrain, with toggles for FEMA flood zones, wetlands, stream setbacks, zoning and roads.
- **Read the Bottom line first.** The report opens with one plain sentence and the lot's biggest open question. Then come the checks, each with its source, its retrieval date, what it can't prove, and who can resolve it: flood, wetlands, septic soils, water and sewer, zoning, road access, easements, seller authority, survey and the closing. A check without a record says *No answer yet*. It never guesses.
- **See how much of the lot is buildable.** GroundTruth starts from the parcel boundary and subtracts every constraint it has a map for: FEMA's flood hazard area, mapped wetlands, the stream setback, slopes over 15%, and the Rural district's side and rear yards from the county zoning code. On the demo lot, the card says about 2.5 of its 3.0 mapped acres (83%) look buildable. Anything it couldn't subtract is named, such as the front yard, which is measured from a right-of-way width no public map gives. It's labeled "Estimate from public maps, not a site plan or survey".
- **Read the ground.** An elevation layer colors the lot by height and draws contour lines. A second toggle shades slopes over 15%. A summary gives the lowest and highest points, total rise, and average and steepest slope, and a draggable profile shows the rise along any line across the lot. It is map-derived USGS 3DEP elevation, labeled as not a survey.
- **Ask this lot**, by typing or by microphone. The answer can use only that parcel's report and cites every check and source it relies on. If the report has no answer, it says "I don't know" and names who does. ElevenLabs transcribes the spoken question and reads the answer aloud. Questions the report can't answer (value, taxes, schools, whether the seller can be trusted) are refused before any model is called.

  > Needs a Railway key: `OPENAI_API_KEY`. For the microphone, also `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` if they aren't set. Until then the live API answers "Ask this lot is not configured yet" and the card is hidden.

- **Pay into escrow, not to the seller.** When you're ready, the deposit goes into a Solana escrow, funded from the deal page or by scanning a Solana Pay QR code. The buyer, seller, payout account, reviewers, mint and exact amount are locked in before any money moves.
- **Verify the owner by phone.** An ElevenLabs voice agent calls the owner of record to ask whether they're actually selling. The answer lands on the deal timeline as evidence for the title reviewer. The call can't approve, hold or release anything.
- **Reviewers sign from their phone.** Title, survey and septic reviewers open `/review` in Phantom and approve or place a hold. A reviewer can attach a document, and its SHA-256 fingerprint goes on-chain in a Memo beside their approval, so anyone with the file can re-hash it and compare. Each staged reviewer wallet also holds a staged credential on the Solana Attestation Service, shown as "✓ Credential on Solana" on rehearsal deals.
- **Catch the wrong paperwork.** When a reviewer uploads a deed, survey or septic report, Claude reads its parcel ID, and the card says "Matches this parcel" or shows a red "Different parcel ID found". It's advisory only: it never blocks an upload or an approval.

  > Needs a Railway key: `ANTHROPIC_API_KEY`. We couldn't confirm it's set, because no public deal has an uploaded document yet. Without it, uploads are stored unread and the check reads "unavailable".

- **Reviewers don't need SOL.** In `/review`, GroundTruth's own devnet fee payer can cover a reviewer's network fee. It signs only as fee payer, is never a party to the deal, and the reviewer's wallet still signs the approval. Proven on devnet: a title approval [`5WhMnU…kuqP`](https://explorer.solana.com/tx/5WhMnUapBd9wRt3R6hzRmVDK5J55geqRDCqB52Ygw7EWmE2DqamkX65tBZcAEJb7EzRV5sE9SkbM1TiE8Ne4kuqP?cluster=devnet) where the fee payer paid 10,000 lamports and the reviewer's balance didn't change.

  > Needs a Railway key: `FEE_SPONSOR_SECRET_KEY`. The live API's `/api/fee-sponsor` reports `{"enabled":false}`, so until it's set, reviewers pay their own fee.

- **The program moves the money.** When every required reviewer has approved, the program pays the exact amount to the seller bound at the start. If anyone places a hold, the program itself rejects the payout, and the buyer can take a refund.
- **Follow the deal from any phone**, with no app or wallet. The deal page updates live from QuickNode Streams, links every step to Solana Explorer, and has a **Verify on-chain** button that reads the escrow account straight from Solana in your browser and checks all 12 fields against the page.

## Why Solana

The program makes the hold, the approval set, the mint, the amount and the payout destination enforceable and checkable by anyone. A PDF report can't do that. Solana is fast and cheap enough for that to sit inside an everyday closing. A reviewer signs from Phantom on a phone, and the buyer never needs a wallet just to follow along.

## How we built it

- **Escrow program:** Rust and Anchor 1.2.2 on Solana devnet, using Circle's devnet USDC. Six instructions (`initialize_deal`, `fund`, `sign_approval`, `place_hold`, `release`, `refund`) and one vault per deal, owned by a PDA. 78 Anchor integration tests cover the wrong mint, the wrong payout account, unassigned reviewers, double approvals, approvals after a hold, and paying out twice.
- **Land data:** a Node and Express API that reads live from Ohio's statewide parcel service (OGRIP) and LBRS address locator, FEMA's National Flood Hazard Layer, the National Wetlands Inventory, USDA soil data, EPA's water system and sewershed maps, and Franklin County's zoning, right-of-way, road, stream-buffer and sanitary engineering layers. Each check runs on its own timeout, so one slow government server never breaks the report.
- **Buildable area and elevation:** the web app samples a grid over the parcel and subtracts each mapped constraint, counting overlaps once. The Rural yard rules come from Franklin County Zoning Resolution §302.043–302.044, read from the county's 2026 PDF. Elevation, contours, slope and the profile come from USGS 3DEP elevation via AWS Terrain Tiles. Slope is measured over an ~8 m baseline so it follows the real terrain tiles, not the upsampled grid.
- **Live chain updates:** a QuickNode Stream filters devnet blocks for our program's transactions, including failed `release` attempts, and posts them to our API. We check QuickNode's HMAC signature, decode the events with our IDL, deduplicate retries, and refuse any event the stored deal can't accept. Webhooks reached our API 1–2 seconds after their block.
- **Voice:** an ElevenLabs Agents outbound call through Twilio places the owner callback, and a signed post-call webhook records only the outcome and conversation ID as evidence. The same agent's voice reads Ask this lot answers.
- **AI, kept in its lane:** for Ask this lot, OpenAI gets the full report JSON and a strict schema, and returns check IDs only. The answer text is assembled from those exact checks. For documents, Claude reads an upload's parcel ID, and the result is advisory. Neither model can change a deal.
- **On-chain credentials:** staged reviewer credentials are issued on the Solana Attestation Service (an issuer, a "GroundTruth staged reviewer" schema, and one attestation per role). The browser reads them from devnet in a single `getMultipleAccounts` call.
- **Frontend:** React 19, TypeScript, Vite, Three.js and MapLibre GL, with a 3D land view, a reviewer portal that works in Phantom on a phone, Solana Pay for funding, a Blink for reviewer approvals, and Verify on-chain.
- **Testing and deploy:** **1,276 tests**: 897 backend unit and route tests, 248 web tests, 53 tests against PostgreSQL 16, and 78 Anchor tests. CI runs everything except the Anchor suite on every pull request, without secrets. The backend also replays the real recorded devnet transactions of both closings through the same filter, webhook and decoder that live deliveries use. Deployed on Vercel and Railway.

## Challenges we ran into

**Public land data is messy.** Ohio has one statewide parcel database, but its 88 counties format parcel IDs differently, so we measured the live formats before search worked reliably. Addresses were worse. `750 High St, Columbus` is actually two lots, 750 N High and 750 S High, and Ohio's address locator can drop a point hundreds of meters from the real building. We keep a parcel only when its published address has the house number, street and direction the buyer typed. Vacant lots are often published with house number 0, and Franklin County's parcel layer lists 0 acres, so the 3.015 acres on our demo lot come from the county auditor, not the map. Columbus publishes no map of its water or sewer mains, so a Columbus lot gets EPA's service areas but no distance to a main, and the report says so.

**The hardest call was what not to say.** A green "you can build here" badge would have been easy. But a lot near a road might not have legal access, a tax class isn't zoning, and FEMA's Zone X means minimal mapped flood risk, not zero. Five Ohio counties have no FEMA flood study at all. So every finding shows its source and what it can't prove, and names the professional who can resolve it. The buildable-area estimate is the same: when a source didn't answer, it says what it skipped instead of treating the land as clear. When a government server times out, that one check says "unknown" and the rest of the report still loads. We never turn a missing answer into a yes or a no.

**The escrow had to be right.** Funds can only go to the seller bound at the start, only assigned reviewers can approve, and a hold blocks payout no matter what the website asks for. During testing we caught a bug: releasing a held deal returned a generic `InvalidDealState` error instead of `DealHeld`, because the program checked the deal's state before checking for a hold. Kadhir fixed the order, tightened the tests and upgraded the program on devnet. Now the held deal's release fails on-chain with `DealHeld (6019)` and the balances don't move. Recording both demo closings took a few tries, because the public devnet RPC kept rate-limiting us, so we kept only signatures we could read back as confirmed.

**Getting the chain into the app.** Our first QuickNode Stream was running the wrong filter and quietly delivered thousands of empty batches before we noticed. Once fixed, it delivered new transactions live, but our plan couldn't backfill history, so the two earlier closings were rebuilt from confirmed devnet transactions instead. Our first speed measurement also looked slow because it included the page's polling delay. The webhook logs showed the real number: events reached our backend 1–2 seconds after their block.

**Keeping the AI in its lane.** An AI voice agent can gather evidence, but it shouldn't be able to move money. We kept the ElevenLabs callback, the reviewer's decision and the smart contract's enforcement completely separate. That made the design more complex but trustworthy. The same rule shaped Ask this lot: the model only picks which of the report's checks answer the question, and the words the buyer reads come from those checks, so it can't invent a finding or tell someone a lot is "safe". Our staged call is real, and the person playing the owner said they're not selling. We recorded it after that deal's hold and refund, so it appears later on the timeline than it would in a real closing. We left it there. Moving it would have made a cleaner story and a false one.

**Sponsoring fees without signing for anyone.** We wanted reviewers to approve without holding SOL, but our API must never sign for a buyer, seller or reviewer. The fee payer is a separate devnet key that is never a deal party. The API simulates each transaction, refuses any instruction that references the fee payer, and caps how many fees it pays per wallet and per deal. The reviewer's own signature is still the one the program checks.

## Accomplishments that we're proud of

- **Everything in the demo is real.** The blocked payout is an actual failed transaction on Solana devnet with `DealHeld (6019)` in the logs, and you can open it on Explorer yourself. The released deal paid exactly 25 test USDC to the bound seller. Both deal pages show this on the live site: the [held deal](https://groundtruth-lac.vercel.app/deals/staged-devnet-deal) and the [released deal](https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released).
- **Our demo lot is a real parcel** in Franklin County that we checked by hand against the auditor, the zoning code and FEMA's maps.
- **Search covers all 88 Ohio counties**, with live FEMA flood checks in the 83 that have a flood study and an honest `unknown` in the other five. The water and sewer check runs for every Ohio lot. On a Grove City lot it finds city water and sewer mains along the lot line.
- **A buyer can follow the money without a wallet.** Verify on-chain matched all 12 fields on the released deal against devnet.
- **Sponsor integrations are real and recorded.** QuickNode Streams delivered four live transactions 1–2 s after their blocks. A real ElevenLabs call reached our signed webhook and landed on the held deal's timeline.
- **1,276 tests**, and CI runs on every pull request.

## What we learned

Most of the value in real estate tech is in the boring parts: knowing which agency owns which answer, and being honest when you don't know. `unknown` turned out to be a useful product result. A buyer doesn't need false certainty. They need to know what's missing, why it matters, and who can resolve it.

Broad coverage and deep coverage are different measurements. OGRIP gives us statewide parcel discovery, but zoning, access, utilities and septic evidence depend on the local authority, so we show both instead of turning one verified county into a statewide claim.

We also learned that a blockchain is a good fit for exactly one piece of this: making sure the money follows the professionals' decisions in a way anyone can check. Public records narrow the question. A title reviewer, surveyor, zoning official or health department resolves it. The program enforces the signed result, but it can't decide whether land is buildable or a seller is legitimate.

## Honest limits

- **Devnet and test USDC only.** No real money moves, and the program is not audited.
- **Staged wallets and credentials.** The buyer, the seller, and the title, survey and septic reviewers are staged devnet keys the team controls, not licensed professionals. Their Solana Attestation Service credentials are test credentials the team issued to its own wallets, shown on rehearsal deals only, and the escrow program doesn't check them.
- **Ohio only, deep in one county.** Parcels come from Ohio's OGRIP layer. Zoning, road access and stream setbacks are read in Franklin County so far. Everywhere else they say *No answer yet*.
- **The demo lot's water and sewer card still reads *No answer yet*.** Its report was hand-verified on Nov 17, before the live water and sewer check shipped, and a seeded report is never overwritten by a live one. Run live, that check finds no mapped public water or sewer for this lot, so it likely needs a private well and a septic system. The report will show that once we update the verified copy.
- **Decision support, not a verdict.** A report isn't a legal buildability opinion, title search, survey or septic permit, and the buildable area is an estimate from public maps, not a site plan.
- **Example pages are labeled.** `/parcels/sample`, `/deals/sample` and `/walkthrough` use a made-up lot and deal, each tagged *Example · Illustrative data*.
- **Sponsor proofs have edges.** The held and released closings were backfilled into the timeline with `replay:devnet`, not delivered by the Stream, because QuickNode backfill needs a paid plan. A timeline update on a second device hasn't been measured separately. The ElevenLabs call was recorded after its deal's hold and refund, so it shows as evidence on a deal that had already settled.

## What's next for GroundTruth

The site's [roadmap page](https://groundtruth-lac.vercel.app/roadmap) says the same thing. Only **Built today** is built. Every **Next** and **Later** item is a plan, and no pilot or partner exists yet.

### Built today (on Solana devnet, with test USDC and staged reviewer wallets)

- **Ohio parcel search and the 3D land view.** Search any Ohio parcel by address or parcel ID, using the state's OGRIP boundaries for all 88 counties. Open a lot to see its boundary in gold on real aerial imagery and terrain, and turn it in 3D.
- **Sourced reports, check by check.** Flood, wetlands, septic soils and public water and sewer service are read from FEMA, the National Wetlands Inventory, the USDA soil survey and EPA wherever those maps cover the lot. Zoning, road access and stream setbacks are read in Franklin County so far, and any check without a record says No answer yet instead of guessing.
- **Solana escrow: holds block payouts, approvals release.** A reviewer's hold makes the payout fail on-chain, and the test USDC stays in the vault. Once every required reviewer approves, the program releases the exact USDC amount the deal was opened with.
- **Reviewer portal, documents, and Verify on-chain.** Title, survey and septic reviewers approve or hold from their wallet, on a phone too through the Phantom app's browser. A reviewer can attach a document whose SHA-256 is written on-chain beside their approval, and Verify on-chain reads the escrow account straight from Solana devnet to check the page against it.
- **Live updates and an owner callback.** QuickNode Streams sends each confirmed escrow transaction to the backend, and the deal's timeline updates without a reload. An ElevenLabs voice agent's call to the owner on record is saved on the held deal's timeline as evidence, never as an approval.
- **Ask this lot.** Ask a question in plain English or by microphone and get an answer drawn only from that parcel report's checks and sources. Every answer cites its check and record, and an uncovered question says I don't know and names the responsible party.
- **Fund with Solana Pay.** While a deal is a draft, its page shows a Solana Pay QR code that opens the escrow's fund transaction in the buyer's wallet. The amount and the escrow address come filled in, and only the buyer can sign it.
- **Staged reviewer credentials on Solana.** Each staged reviewer wallet holds a devnet credential on the Solana Attestation Service, and rehearsal deal pages read it from the chain. They are test credentials the team issued to its own wallets, and the escrow program does not check them yet.

Also built: the buildable-area estimate, elevation and slope, the advisory document check, and reviewer fee sponsorship (see *What it does*).

### Next (pilot) · planned, not built yet

- **A title or closing company pilot in Ohio.** Run real deals with an Ohio title or closing company, with its licensed staff as the reviewers and private, signed-in evidence handling in place first. The professionals, not us, would define when money is released and when it is refunded.
- **Mainnet with real USDC and sponsored fees.** Move the escrow from devnet test funds to Solana mainnet and real USDC. Network fees would be sponsored with the fee-payer flow already built for the reviewer portal, so a reviewer never needs to hold SOL to sign.
- **Verified reviewer credentials.** Licensed title, survey and septic professionals would carry a credential from a real issuer, such as a licensing board or a title underwriter. The escrow would count an approval only from a wallet that holds the right one.
- **More local checks.** Zoning for more Ohio counties, and the distance to water and sewer mains in more cities than the few that publish their main maps. Easements would be read from recorded documents, each one cited like every other check.

### How we'll measure the pilot

There is no pilot yet, so there are no results to show.

1. **Time to the first actionable finding:** how long from opening a lot until the buyer has one concrete thing to do next.
2. **Findings with traceable evidence:** the share of material findings that link to the public record or sign-off behind them.
3. **Buyers who can explain a pause:** when a deal is paused, whether the buyer can say why and what has to happen next.

### Later (scale) · planned, not built yet

- **Nationwide parcels.** Parcel boundaries beyond Ohio would come from a nationwide provider such as Regrid. FEMA's flood maps are already a national service, so the flood check would carry over wherever FEMA has mapped.
- **Deed recording handoff.** After the escrow releases, the deed would be handed to the county's e-recording system. The recording receipt would join the deal's timeline beside the payout.
- **Seller identity verification.** A trusted identity partner would confirm the seller is the owner on record. It would be a step inside the closing flow, finished before any reviewer can approve.
- **Milestone payments and deadlines.** A deal could be split into staged payments, each with its own deadline. If a review never arrives in time, the buyer's money would be refunded automatically.
- **Saved lots with alerts.** Save a lot and get an alert when its public records change, such as a new flood map. Each alert would link to the source that changed.

## Technologies used

Rust · Anchor · Solana devnet · SPL Token · SPL Memo · Solana Attestation Service · Solana Pay · Solana Actions (Blinks) · Circle devnet USDC · QuickNode Streams · ElevenLabs Agents · Twilio · OpenAI · Claude (Anthropic) · TypeScript · React · Vite · Three.js · MapLibre GL · Node.js · Express · Zod · Prisma · PostgreSQL · Vitest · LiteSVM · GitHub Actions · Vercel · Railway · Ohio OGRIP parcels and LBRS · FEMA NFHL · USFWS National Wetlands Inventory · USDA NRCS SSURGO · US EPA water system and sewershed maps · USGS 3DEP · USDA NAIP · Franklin County GIS and Auditor

## Program details

- **Network:** Solana devnet
- **Escrow program:** [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet) ([deploy transaction](https://explorer.solana.com/tx/4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU?cluster=devnet)). Its published Anchor IDL ([metadata account](https://explorer.solana.com/address/uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma?cluster=devnet)) is identical to the IDL our backend decodes events with.
- **USDC mint (Circle devnet):** [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet). The program rejects any other mint.
- **Staged reviewer credentials (Solana Attestation Service):** credential [`BVrSkg…UBB`](https://explorer.solana.com/address/BVrSkgLXY5fJ67anEkj2F2zhSPFr2BxQRnAw8N7taUBB?cluster=devnet), schema [`7tQHRj…GuS`](https://explorer.solana.com/address/7tQHRjjiPvDU6gaYkCz6EABSygRUVxBt3GhKGXVUGGuS?cluster=devnet), and the title [`C51Ds1…t2xJ`](https://explorer.solana.com/address/C51Ds1fUCPZdCenXz2KS8tWZSqAunR6xXQacCKAnt2xJ?cluster=devnet), survey [`BpVTHe…awkR`](https://explorer.solana.com/address/BpVTHemJpJw6rzZg2S9WcAjhEQdE58fWtNYNQ24pawkR?cluster=devnet) and septic [`3L2x6J…nyJ`](https://explorer.solana.com/address/3L2x6J3r8ih56fnjkss1Ka2P7fk59EcL3Z2SGLkpQnyJ?cluster=devnet) attestations.
- All funds are test USDC, and reviewer wallets are staged for the demo.

### Escrow outcomes on devnet (Nov 18, 2026)

Both deals use the golden parcel, 25 test USDC and the same staged wallets. Every transaction below is finalized.

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

Balances are test USDC after each step, read from the transactions' token balances on the public devnet RPC. Where a step doesn't touch an account, its value is carried from the steps on either side. The rejected release's log reads: "Error Code: DealHeld. Error Number: 6019. Error Message: Cannot release funds while deal is under active hold."

Not shown on devnet: a second release attempt on the released deal. The vault is closed, and the local test suite covers repeated settlement.

### QuickNode Streams

A Solana devnet Stream on the Block dataset, filtered to our escrow program, sends confirmed program events to a signed webhook that writes them to the buyer's deal timeline. On Nov 18 the stage deal `staged-devnet-deal-live` ([`2UrftJ…F6Cg`](https://explorer.solana.com/address/2UrftJMzbvMngu6Mdg4PhFscqkCHnuLksfbSAiddF6Cg?cluster=devnet)) ran four transactions: initialize [`jmK7fg…pPeE`](https://explorer.solana.com/tx/jmK7fg1PBNa2kYfqbvaDJ3sNWCBSUM4gAbEp529M5QHYeg145EF9RpKGaHKThkZ9PGt2Q9o1jDRFG2ny2GApPeE?cluster=devnet), fund [`5waYrx…PxH5`](https://explorer.solana.com/tx/5waYrx5rD6y7sZttZ73i7H2v1eFyqXvuCkuwxBKC11atb5DQi3CsgHrEyUYrwppxTPPHowg1uxxRejrcaVrJPxH5?cluster=devnet), and the title [`2VSXvY…sFPL`](https://explorer.solana.com/tx/2VSXvYoKQcaHxfK6V8zCFZE9imyBxE8ZF3b8RK7snsP57HxrWdpnYVWUT8puLoZ53bKzvoas2CyuvBUZeRGvsFPL?cluster=devnet) and survey [`Gj327z…M89V`](https://explorer.solana.com/tx/Gj327zRzpfPwqmnTW669iuBQ1DK8e1PTWSMoQKmZcvezZZuZTwFded8mea1bHvHsKLDnfYCBS1w4YikYeNsM89V?cluster=devnet) approvals, in slots 523727603–523727618. All four were applied straight from the Stream, with no replay: the API logged `quicknode applied` for `DealInitialized`, `DealFunded`, and both `ApprovalSigned` events ([Railway log](https://github.com/hudakjoseph28/GroundTruth/blob/main/docs/proof/quicknode-stage-prep.png)).

Railway's HTTP log shows each webhook arriving 1–2 s after its block (18:57:20–18:57:24 UTC). The 1.8–3.3 s first measured on the deal timeline came from polling the timeline API every 1.5 s against whole-second block times, so it includes up to 1.5 s of polling delay. The screenshot's app-log lines are all stamped 13:57:29 EST; the arrival times come from the HTTP log, which is not in the repo.

### ElevenLabs owner callback

A real **ElevenLabs Agents** call to a consenting teammate playing the owner of record (conversation `conv_9801m7rbaxvye0yrq4jmyzfyq6xz`) ended at 22:10:40 UTC on Nov 18. The API verified its signed post-call webhook and logged `elevenlabs recorded ownerDeniesSale conv_9801m7rbaxvye0yrq4jmyzfyq6xz deal=staged-devnet-deal` at 22:10:54 UTC ([Railway log](https://github.com/hudakjoseph28/GroundTruth/blob/main/docs/proof/elevenlabs-owner-callback.png)). The held deal shows it as an `Evidence received` row: the person reached as the owner on record said they are not selling. Only the outcome and conversation ID are stored, with no transcript, audio or phone number.

The call was recorded **after** that deal's hold and refund, so it appears after them on the timeline. In a real closing, this callback is what prompts the title reviewer to hold. Here it is evidence only and changed no deal state. The escrow program checks only the title reviewer's signature, never the call.
