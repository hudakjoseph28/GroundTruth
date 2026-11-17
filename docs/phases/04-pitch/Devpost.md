# GroundTruth Devpost draft

**Tagline:** Know the land. Know what comes next.

**One-sentence pitch:** GroundTruth helps a first-time Ohio land buyer understand a parcel before paying by showing sourced facts, honest gaps, and the person responsible for the next decision.

> Submission note: Keep every `[PENDING]` label until the named owner confirms the integration and supplies the required proof. Remove the label only after that proof is recorded in the repository.

## What it does

Buying vacant land can look simple until the buyer asks basic questions: Can I build here? Can I legally reach the lot? Is sewer service available? Is the person asking for my money authorized to sell it? The answers are scattered across parcel maps, county records, FEMA data, local rules, and professional reviews.

GroundTruth brings that evidence into one buyer-readable report. It shows what a public record supports, what it does not establish, who can resolve the open question, and what the buyer should do next. It is decision support, not a legal buildability opinion, title search, survey, identity service, or deed-transfer system.

The current web demo searches two real Ohio parcel fixtures and opens their published boundaries. The backend supports live address and parcel-ID search against Ohio OGRIP across all 88 counties. It also builds live FEMA flood checks in the 83 counties with an NFHL study. Missing or timed-out evidence stays `unknown` instead of becoming a guessed answer.

Our golden parcel is a real 3.015-acre vacant lot in Franklin County. County zoning maps it Rural, but county GIS shows no road right-of-way touching it and the nearest mapped road centerline is about 106 metres away. A title reviewer still has to determine whether a recorded access easement exists. That is the moment we want a first-time buyer to understand: acreage and zoning can look promising while legal access remains unresolved.

The second fixture is a real 1.2-acre vacant parcel in Licking County. Its boundary and FEMA finding are sourced, while the seeded zoning check remains `unknown` because GroundTruth has not integrated and reviewed that local zoning source yet. The report remains useful by naming the township zoning inspector as the next responsible person.

ALTA's 2026 survey of 245 title insurance professionals found that 59% of respondents reported at least one seller-impersonation attempt during 2025, compared with 28% of respondents in ALTA's 2024 survey reporting experience during 2023. Those are respondent-level reports of attempts, including failed attempts. They are not a per-sale probability or a count of successful frauds. This is why GroundTruth treats seller authority as a professional decision rather than a fact inferred from a parcel record.

**[PENDING] Solana escrow:** The planned closing flow holds staged test USDC until the required staged reviewers sign. A reviewer hold should block release, while a fully approved deal should pay only the bound seller. Do not describe either outcome as working until the escrow owner confirms devnet transactions, Explorer links, and before-and-after balances.

**[PENDING] ElevenLabs:** The planned owner callback supplies evidence to a staged title reviewer. The call never approves, holds, releases, or refunds a deal by itself. Do not enter the ElevenLabs bounty until the owner confirms a real consenting-participant call, verified webhook delivery, and audible demo footage.

**[PENDING] QuickNode Streams:** The planned Stream projects confirmed GroundTruth program events into the buyer timeline and updates a second device. Do not enter the Streams bounty until the owner confirms the deployed-program filter, verified webhook, deduplication, matching transaction signature, and measured second-device update.

## How we built it

We built GroundTruth as a pnpm workspace with one shared TypeScript contract. The React web app renders the search flow, parcel boundary, evidence cards, 3D land view, and staged closing interface. The Express API owns public-data access so the browser never talks directly to OGRIP, FEMA, PostgreSQL, or a provider that needs a secret.

For parcel discovery, the backend queries Ohio's statewide OGRIP parcel FeatureServer. Parcel IDs are normalized without changing the published local ID, and address search uses Ohio's LBRS locator with a bounded site-address fallback. The API returns the published geometry, source URL, and retrieval time.

For reports, each evidence check runs independently. The live pipeline currently combines the OGRIP parcel with FEMA's National Flood Hazard Layer. A provider miss, timeout, or uncovered county becomes an explicit `unknown` check with a responsible party and next action. The manually verified Franklin fixture adds county zoning, the zoning resolution, the Auditor's legal acreage, county right-of-way and road layers, and the Big Darby riparian-setback layer. The Licking fixture deliberately demonstrates a partial report.

Prisma maps the shared contract into PostgreSQL for seeded and cached reports. The API exposes health, parcel search, parcel detail, report, coverage, staged deal, and timeline routes. Tests replay recorded public-provider responses so the normal, missing-data, and timeout paths remain reproducible without inventing facts.

The web is built with React, Vite, TypeScript, Three.js, and react-globe.gl. The API uses Node.js, Express, Zod, Prisma, and PostgreSQL. Vercel hosts the web deployment and Railway hosts the API and database documented in the repository.

**[PENDING] Escrow build:** Rust, Anchor, SPL Token, Solana devnet, and Circle test USDC are present in the intended architecture, but the Devpost submission must not claim a working on-chain outcome until the escrow owner confirms the deployed program and receipts.

**[PENDING] Sponsor integrations:** QuickNode Streams and ElevenLabs must remain described as planned integrations until their owners confirm the end-to-end acceptance checks.

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

**[PENDING] Do not add escrow, ElevenLabs, or Streams to this accomplishments list until their owners confirm the required proof.**

## What we learned

We learned that `unknown` can be a useful product result. A buyer does not need false certainty. They need to know what is missing, why it matters, and who can resolve it.

We also learned that broad coverage and deep coverage are different measurements. OGRIP gives us statewide parcel discovery, while zoning, access, utilities, and septic evidence depend on the local authority. GroundTruth should show both measurements instead of turning one verified county into a statewide claim.

The most important design lesson was to keep evidence, professional judgment, and payment enforcement separate. Public records can narrow the question. A title reviewer, surveyor, zoning official, or health authority resolves it. A payment system can then enforce the signed conditions, but it cannot decide whether the land is buildable or whether a seller is legitimate.

## What's next for GroundTruth

Our immediate product step is to connect the web search experience to the live parcel API. The backend already supports live statewide discovery, while the current web demo uses the two canonical fixtures. We also want to add verified local zoning and access adapters behind the same report contract, county by county, without weakening the `unknown` state.

We will test the report with first-time land buyers and title or closing professionals. The pilot questions are practical: Can a buyer explain the biggest open issue? Do they know who acts next? Does the report help them pause, negotiate, or walk away before sending money?

- **[PENDING] Escrow:** confirm local and devnet held, released, and refund outcomes; record program ID, deal addresses, Explorer links, and balance changes.
- **[PENDING] QuickNode Streams:** confirm the filtered devnet Stream, verified webhook, idempotent timeline projection, and second-device update.
- **[PENDING] ElevenLabs:** confirm a real staged callback with a consenting teammate, verified webhook evidence, reviewer handoff, and audible video footage.
- Add authenticated, private evidence handling before any real buyer, seller, identity, title, or call data enters the product.
- Work with a title or closing partner to define production approval, hold, release, and refund terms. The hackathon workflow is a staged prototype, not a production closing service.

## Technologies used

### Working on `main`

- TypeScript and pnpm workspaces
- React, Vite, Three.js, and react-globe.gl
- Node.js, Express, and Zod
- Prisma and PostgreSQL
- Ohio OGRIP statewide parcels and LBRS address locator through ArcGIS REST services
- FEMA National Flood Hazard Layer
- Franklin County Auditor, zoning, road right-of-way, road-section, and stream-buffer sources for the verified golden parcel
- Vitest and Supertest
- Vercel and Railway deployment configuration

### Awaiting owner confirmation

- **[PENDING]** Rust and Anchor
- **[PENDING]** Solana devnet, SPL Token, and Circle test USDC
- **[PENDING]** QuickNode Streams
- **[PENDING]** ElevenLabs
