# Parcel demo script: 0:30 to 1:15

**Goal:** In 45 seconds, show a real parcel, one fact that changes the buyer's plan, the public source behind it, and the limits of what GroundTruth can claim.

## Before going on stage

- Open <https://groundtruth-lac.vercel.app> signed out and leave the page at the top of the homepage.
- Set browser zoom to 100% and confirm the search field, result, parcel page, and three ledger cards are readable on the projector.
- Bookmark the direct parcel URL: <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>.
- Keep that direct URL loaded in a second tab as the final fallback.
- Do not open an external county source in this 45-second segment. The source name, retrieval date, finding, limitation, next action, and responsible party are already visible in the details drawer.

## 0:30 to 0:38 | Search the parcel

### Clicks

1. Click the field labeled `Parcel ID or address` if it is not already focused.
2. Type exactly `230-000918`.
3. Click the gold `Find parcel` button.

### On screen

- The browser opens `/search?q=230-000918`.
- The page heading is `Search`.
- One result shows `230-000918`, `Franklin County`, and `Matched parcel ID`.

### Say

> “Let's start with a real vacant lot in Franklin County.”

> “I can find it by the parcel ID published in Ohio's statewide records.”

## 0:38 to 0:47 | Open the parcel

### Clicks

1. Click the result labeled `230-000918`.
2. Let the short parcel transition finish. If it lasts more than two seconds, press any unmodified key or click the transition to skip it.

### On screen

- The transition briefly says `Loading parcel…` and may show the latest Solana devnet slot.
- The parcel page heading is `230-000918` with `Franklin County` and parcel key `ohio:39049:230-000918`.
- The lot appears as a 3D land block with real aerial imagery, elevation, and its published boundary outlined in gold.
- The `Ledger` lists the parcel checks. `Road access` is marked `Needs review` and `Biggest open question`.

### Say

> “This opens the parcel boundary Ohio publishes, not a shape we drew for the demo.”

> “Beside it, GroundTruth shows each check, its status, and who has to act next.”

## 0:47 to 1:00 | Show the access question and source

### Clicks

1. Scroll just enough to see the `Road access` card if it is below the fold.
2. Click the `Road access` title.
3. In the details drawer, point in order to `Needs review`, `What we know`, `What it does not establish`, and `Sources`.
4. Pause on the first two source links: the Franklin County right-of-way layer and the Franklin County Engineer road-sections layer. Do not open them in a new tab during the timed segment.

### On screen

- The drawer heading is `Road access` with status `Needs review`.
- `What we know` says no mapped road right-of-way touches the parcel and identifies Seaman Road as the nearest mapped road.
- The current card rounds that road distance to about 107 m. The independent QA calculation is 105.75 m, or about 106 m, so the spoken line below uses `just over 100 metres`.
- `What it does not establish` explains that GIS cannot show recorded easements, private lanes, or other legal access.
- `Sources` names the county right-of-way layer, the county engineer road layer, and the Franklin County Zoning Resolution.
- `Next action` sends the legal-access question to title review, followed by county zoning review for frontage or a conditional private-lane path.

### Say

> “This is the fact that changes the plan. No mapped county right-of-way touches the lot, and Seaman Road is just over 100 metres away.”

> “But GIS cannot show a recorded easement. A title reviewer has to resolve legal access, and these are the county sources behind that flag.”

## 1:00 to 1:15 | Put zoning and flood in context

### Clicks

1. Click `Close` in the access drawer.
2. Click the card titled `Can you build here?` and point to `Evidence found` and `What we know`.
3. Click `Close`, then click the `Flood` card and point to `Evidence found` and `What it does not establish`.
4. Click `Close` at 1:15 so the parcel ledger is clean for the handoff to the next demo segment.

### On screen

- The zoning drawer says the whole mapped parcel is Rural (`R`), one-family dwellings are permitted, and the Auditor lists 3.015 legal acres.
- The same zoning finding says the 150-foot frontage condition still applies. Its limitation says mapped zoning and acreage are not a zoning certificate or building permit.
- The flood drawer says FEMA maps the parcel as Zone X and lists both returned FIRM panels.
- The flood limitation says Zone X is not a guarantee against flooding or a flood-insurance determination.

### Say

> “Zoning is promising, not a green light. Rural allows one home, and the Auditor lists 3.015 legal acres.”

> “The 150-foot frontage rule still applies.”

> “FEMA maps Zone X, which means minimal mapped hazard, not zero flood risk.”

## Backup plan

### If search is slow or does not show the result

1. Click the `GroundTruth` wordmark to return to the homepage.
2. Under the search box, find the words `Try a demo parcel:`.
3. Click the gold `230-000918` chip. It goes directly to the verified parcel without using the search-results step.
4. Say: “I'll open the verified demo parcel directly and keep us moving.”

The header's `Try the demo` button reaches the same parcel if the homepage chip is off screen.

### If the parcel page itself is slow

1. Switch to the preloaded backup tab for <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>.
2. If the transition is still covering the page, press any unmodified key or click it to skip.
3. Continue at `Show the access question and source`.

### If an external source is slow

Do not open it. Keep the details drawer on screen and point to the named authority, source title, retrieval date, finding, and limitation. The full source URLs and judge answers are preserved in [QA-Proof.md](QA-Proof.md).

## Claim guardrails

- Say `no mapped right-of-way touches the parcel`, never `the parcel has no access`, `landlocked`, or `inaccessible`.
- Say `title review resolves recorded legal access`, because GIS cannot show a recorded easement.
- Say `Rural zoning is promising`, never `a house can definitely be built here`.
- Say `Zone X is minimal mapped hazard`, never `safe from flooding` or `no flood risk`.
- Keep the Big Darby overlap in reserve for Q&A: about 4.7% of the mapped parcel overlaps the county riparian-setback layer, with no permit or buildable-area conclusion.
