# Submission readiness

**Audited:** Wed Nov 18, 2026, finishing 12:25 p.m. ET, as a signed-out judge.
**Internal deadline:** Fri Nov 20, 11:00 a.m. ET. Devpost closes 1:00 p.m. ET.

**What was audited:** <https://groundtruth-lac.vercel.app> and its `/api` routes, in Chrome at 1440 × 900 and at a 390 px phone viewport (emulated, with touch). The API reported commit `0bc6a93`; `main` was at `6b61ce9`, and the two commits in between touch only `escrow/` and docs. PRs #27, #28, and #29 then merged and deployed (the API now reports `f0568ac`), and both demo closings ran on devnet. The escrow, QuickNode, and ElevenLabs rows were rechecked after that; the parcel audit was not repeated. Everything marked "watched" below was seen on screen or read from a live response during this audit. Nothing here is taken from a PR description.

## Where we stand

Updated 12:55 p.m. ET, after #27, #28, and #29 merged and both demo closings ran on devnet.

- **The parcel half is ready to demo.** Search, the golden parcel, the Licking parcel, a live Columbus address, and every source link worked at both widths with no page errors.
- **Both escrow outcomes are now on devnet.** The held deal's release was rejected with `DealHeld (6019)` and the vault stayed at 25 test USDC; the cleared deal paid the seller exactly 25. All eleven transactions were read back from the public RPC, and the links are in [Devpost.md](Devpost.md).
- **The product does not show any of it.** The API still reports both deals as `draft`, the website has no deal page, and the golden parcel page now says "no funds have moved" about a deal that was funded, held, and refunded.
- **A judge cannot open the repo.** It is private, so the four GitHub links on the site return GitHub's 404.

## Punch list

Ranked. Owners: **Joey** web UI · **Kadhir** escrow · **Satya** API, QuickNode, ElevenLabs, deploy · **Gagan** parcel data and submission.

### Blockers: the submission fails without these

| # | Problem | Evidence | Owner | Exact fix |
| --- | --- | --- | --- | --- |
| B1 | **The GitHub repo is private.** | Signed out, `github.com/hudakjoseph28/UBC-Hackathon` returns 404. The site's Docs, GitHub, Data contract, and Team links all go there. | Joey (repo owner) | Repo → Settings → General → Danger Zone → Change visibility → Public. A pattern scan of every branch's history found no tokens, key files, env files, or Solana keypairs (the only credential-shaped strings are `localhost` test database URLs). Then reload the four links in a private window. |
| B2 | **The devnet run is not recorded in the repo or the API.** | Both closings are on-chain (deal accounts `54Va6q…E4tW` and `3uBECm…2yu`). `escrow/demo-results/devnet-*` is not on `main`, and `GET /api/deals/staged-devnet-deal` and `…-released` still return `draft` with no chain rows. | Kadhir, with Gagan (the run's output files are on Gagan's machine); Satya for the API | 1. Commit `escrow/demo-results/devnet-*.json` and `.md`. 2. Against the Railway database, run `pnpm --filter @groundtruth/backend replay:devnet --deal staged-devnet-deal`, then the same for `staged-devnet-deal-released`. 3. Confirm the two deal routes report `refunded` and `released` with a `releaseRejected` row. 4. Back up `escrow/.demo-wallets/` privately. |
| B3 | **The website cannot show an escrow outcome.** | `/deals/staged-devnet-deal` renders a blank black page: the app has no deal route. The golden parcel's escrow strip is built from a bundled fixture, not from `GET /api/deals/:id`, so it did not change after the devnet run. | Joey | Build the `/deals/:dealId` page from [ConnectSurfaces](../03-connect-surfaces/ConnectSurfaces.md): read `/api/deals/:id` and its timeline every 2 seconds; show state, each timeline row, the rejected-release reason, and an Explorer link per signature. Link to it from the golden parcel's escrow strip. Make the strip read the same API. **Done on `gagan/deal-page`:** the deal page reads the deal and timeline from the API every 2 seconds, with Explorer links and a desktop QR code, and the golden parcel's strip reads the same API and links to it. |
| B4 | **There is no video.** | Nothing recorded. | Gagan | Record from [VideoScript.md](VideoScript.md). The Explorer fallbacks for shots 9 to 12 can be filmed now; the in-product shots wait for B2 and B3. Upload to YouTube as Public or Unlisted and play it in a private window with sound. |
| B5 | **The Devpost entry is not confirmed.** | The site footer still reads `Devpost TODO: add link`. This audit could not see a Devpost draft. | Gagan | Create the Devpost project from [Devpost.md](Devpost.md). Add all four members. Select Consumer Applications and Best Use of Solana, and only the bounties whose proof exists. Paste the repo, app, and video links. Save the confirmation. |

### High: a judge will notice, or a prize claim depends on it

| # | Problem | Evidence | Owner | Exact fix |
| --- | --- | --- | --- | --- |
| H1 | **The live golden parcel page now contradicts the chain.** | Watched on the live site after #29 deployed: the escrow strip has no `STAGED` tag and reads "Waiting on 3 sign-offs · Draft · 0/3", and the ledger says "Nothing here is on-chain yet, and no funds have moved." On devnet that deal was funded, held, and refunded. The cards below still say "Seller authority: Held" and "Survey: Signed off", which did not happen on-chain either. | Joey | Today: in `frontend/web/src/data/ledger.ts`, stop `hasChainState` from counting `escrowAddress` alone, which restores the labelled staged strip. Then B3: read the deal from the API so the strip shows the real state. Background is in the [#29 review comment](https://github.com/hudakjoseph28/UBC-Hackathon/pull/29#issuecomment-6986045575). **Done on `gagan/deal-page`:** the strip and the reviewer cards now come from the API's deal, and the "no funds have moved" line is gone. |
| H2 | **QuickNode: the Stream did not project the closings.** | Eleven escrow transactions finalized between 12:41 and 12:48 p.m. ET. At 12:50 the API still showed both deals as `draft` with no chain rows. The only recorded Stream proof is the Nov 15 heartbeat run. The webhook is live: an unsigned POST gets 401. | Satya | Find out why: Stream paused, wrong filter, or deliveries skipped (Railway logs for `/api/webhooks/quicknode` from 17:41 UTC). Backfill with `replay:devnet` (B2). A replay is not Stream proof, so the bounty still needs one live delivery: resume the Stream and run a fresh `-v2` deal, then record the signature and the time it appeared on a second device. |
| H3 | **ElevenLabs: no staged call is recorded.** | #27 is merged and deployed: at 12:45 p.m. ET an unsigned `POST /api/webhooks/elevenlabs` got 401, so the secret is set. Neither deal has an `evidenceReceived` row. | Satya | Place the staged call to a consenting teammate with `call:owner --confirm`. Save the conversation ID and record the call audio for the video. Enter the bounty only after that. |
| H4 | **Unknown URLs show a blank black page.** | `/deals/staged-devnet-deal`, `/deals/…/timeline`, and `/nope` render nothing: no header, no message. | Joey | Add a catch-all route in `App.tsx` inside `SiteLayout`: "Page not found" plus links to home and the demo parcel. **Done on `gagan/deal-page`:** unknown URLs show a "Page not found" page inside the site layout. |
| H5 | **Two TODO labels are visible on the public site.** | Footer on every page: `Devpost TODO: add link`. Homepage: `Become a reviewer` beside `TODO: reviewer signup`. | Joey | Put the Devpost URL in `FOOTER.devpost` once B5 exists, or remove the row. Remove the reviewer button, or label it "Not open yet". |
| H6 | **Searching the golden parcel's own address finds nothing.** | The result card shows `0 SEAMAN RD`. Searching `0 Seaman Rd` returns "No Ohio parcel matched". | Gagan | Let a house number of `0` match the published site address, or do not show a `0` address on the card. |
| H7 | **The root README is out of date and lacks the sponsor details the bounties ask for.** | It says the web "still searches those two fixture parcels" (the live site searches OGRIP) and that `pnpm dev` and `pnpm test` are "not set up yet". It does not state QuickNode's network, dataset, filter, and destination, or ElevenLabs' product and role. | Gagan, with Satya | Update the status paragraphs. Add a short "Sponsor integrations" section with those facts and links to `backend/README.md`. Add the two deal addresses and Explorer links after B2. |
| H8 | **Three homepage lines claim more, or less, than is true.** | "Licensed reviewers sign": the demo reviewers are staged wallets. "Shown: the demo parcel, with a stand-in boundary": the demo script says this is the boundary Ohio publishes. Diagrams say "25,000 USDC" while the staged deal is 25 test USDC. | Joey | Change to "Reviewers sign". Correct or delete the stand-in note after checking which boundary the tile draws. Write "test USDC" in the diagrams. |
| H9 | **The presenter, proof sheet, and reset sheet do not exist.** | [Pitch.md](Pitch.md) asks for a named presenter and demo driver by Nov 18, a proof sheet, and a reset sheet. | Gagan | Name both people in Pitch.md. Build the proof sheet from `escrow/demo-results/` and the tables in Devpost.md. Both fixed deal IDs are now used, so a reset means new `-v2` labels; write that down as the reset procedure. |

### Polish: fix if time allows

| # | Problem | Owner | Exact fix |
| --- | --- | --- | --- |
| P1 | The report says Seaman Rd is "about 107 m" away and the setback covers "about 5%". [QA-Proof.md](QA-Proof.md) computed 105.75 m and 4.661%. | Gagan | Change the golden fixture to "about 106 m" and "about 4.7%", or keep saying "just over 100 metres" on stage. |
| P2 | Every details drawer shows a "Reviewer wallet → Escrow program" diagram and "This approval hasn't been signed on-chain yet", including Flood and Water & sewer, which no reviewer signs. | Joey | Show that block only for seller authority, survey, septic, and closing. |
| P3 | The Licking result repeats the city and ZIP: `93 WOODY KNOLL DR THORNVILLE, OH 43076 THORNVILLE 43076`. | Gagan | Drop the duplicated tail when normalizing the site address. |
| P4 | On parcels with no deal, the Closing card reads "Signs Unassigned" and "No next action is recorded." | Joey | Hide the Closing card when the parcel has no deal. |
| P5 | The parcel page does not show the site address, and the golden parcel shows no acreage. | Joey | Add both under the parcel ID. |
| P6 | A direct link to the golden parcel takes 4.7 to 5.8 seconds before the heading appears on a cold load. Through search it takes about 1.8 seconds. | Joey | Cap the opening transition at about 1.5 seconds on direct loads. The demo script's "press any key" skip already covers the stage. |
| P7 | No favicon, description, or share-preview tags. `/favicon.ico` returns the HTML shell. Every tab is titled "GroundTruth". | Joey | Add a favicon and `description` / `og:` tags in `index.html`. |
| P8 | "Back to search" forgets the query. | Joey | Link back to `/search?q=<last query>`. |
| P9 | `/api/health` reports a commit that is set by hand. | Satya | Update `GIT_COMMIT` on Railway at each deploy. |

## Definition of a winning build

From the [README](../../../README.md#definition-of-a-winning-build).

| Item | Status | Evidence |
| --- | --- | --- |
| Public URL loads signed out; search is obvious in five seconds | **Pass** | Watched. First paint in under 1 second at both widths. The search box and the gold "Find parcel" button are in the first screen. |
| Search returns real OGRIP boundaries from two counties; golden report shows a dated source, a gap, and the next person | **Pass** | Watched. `230-000918` and `84 W Dodridge St` (Franklin) and `00500729609000` and `93 Woody Knoll Dr` (Licking) return results in 0.3 to 1.4 seconds. The Road access drawer shows three sources retrieved Nov 17, 2026, "What it does not establish", and "Title reviewer, then county zoning office". |
| Held deal rejects release on-chain with balances unchanged | **Pass on-chain** | [Rejected release](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet): `DealHeld (6019)`, vault 25 → 25, seller 0 → 0, buyer 15 before and after. Not shown in the product (B2, B3). |
| Cleared deal pays the exact amount once; every claim has an Explorer link | **Pass on-chain** | [Release](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet): seller 0 → 25, vault closed, after three approvals. All eleven links are in Devpost.md. No second release was attempted on devnet. The website shows none of these links (B3). |
| ElevenLabs call creates reviewer evidence, never an approval | **Not yet** | The webhook is live, but no call is recorded (H3). |
| QuickNode Stream drives the timeline on a second device | **Not yet** | The Stream did not project the Nov 18 closings, and the web has no timeline page (H2, B3). |
| Video, repo, and app all open signed out | **Fail** | App: pass. Repo: 404 (B1). Video: does not exist (B4). |

## Submission checklist

From the [UBC brief](../../ubc/UBC-Hackathon.md#demo-and-submission).

| Item | Status | Evidence |
| --- | --- | --- |
| Name, description, members, technologies, track, Solana, bounties | **Not yet** | Text is drafted in [Devpost.md](Devpost.md). No Devpost entry was seen (B5). |
| Written answers: build, problem, how it works, what's different, what's next | **Partly** | Devpost.md covers all but a "what's different" answer. Its escrow outcomes are now filled in with Explorer links; QuickNode and ElevenLabs are still `[PENDING]`. |
| Public repo with setup; README with architecture, program IDs, network, sponsor configuration | **Fail** | Private (B1). The README has setup, the program ID, and devnet, but stale status lines and no sponsor section (H7). |
| Working demo plus a 2–3 minute video with audible ElevenLabs output | **Not yet** | The parcel demo works. No video, and no ElevenLabs call to hear (B4, H3). |
| Eligibility and attendance verified; demo, repo, video open signed out | **Not yet** | Demo opens. Repo and video do not. Attendance is not recorded anywhere in the repo. |

## Audit detail

### What worked (watched at both widths)

| Step | Desktop 1440 px | Phone 390 px |
| --- | --- | --- |
| Homepage: page load / first paint | 0.4 s / 0.9 s | 0.3 s / 0.4 s |
| Search `230-000918` → result | 0.8 s | 0.3 s |
| Search `84 W Dodridge St` → result (live OGRIP) | 1.4 s | 0.8 s |
| Result click → ledger readable | 1.8 s | 1.8 s |
| Junk query `asdfqwerzzz` | "No Ohio parcel matched…" with a hint, 0.4 s | same |
| One-letter query | "Enter at least 3 characters…" | same |
| Unknown parcel, malformed key | "Parcel not found" with a reason and a way back | same |
| All nine ledger drawers on three parcels | open, readable, close | full-width sheet, no sideways scroll |
| Header links, phone menu, How-it-works tabs, Held / Cleared toggle, 3D / 2D switch, Explore menu | work | work |

- **Console:** no page errors on any page. The only errors are the expected 404 and 400 for the deliberately bad parcel keys.
- **Layout:** no horizontal overflow at 390 px on any page tested.
- **Links:** 35 distinct external links collected from the homepage and all drawers. Every source link (Franklin County, FEMA, ALTA, FBI IC3, OGRIP, Bowling Green Township, Google Maps and Earth) loaded in a browser. The four GitHub links fail (B1). FEMA's `hazards.fema.gov` reset several scripted requests but loaded in the browser each time.
- **API:** `/api/health`, `/api/coverage`, parcel search, parcel detail, both seeded reports, and the staged deal and timeline all returned 200 in under 1 second.
- **Staged labels:** the golden parcel's ledger is tagged "Staged demo data" and says "Nothing here is on-chain yet, and no funds have moved." The homepage diagrams are captioned "Illustration" or "Illustrative activity".

### Other searches tried

| Query | Result |
| --- | --- |
| `230000918` (no hyphen) | Golden parcel |
| `84 west dodridge street`; the same with city, state, ZIP | Correct parcel |
| `0 Seaman Rd`, `Seaman Rd` | Nothing (H6) |
| `1 Capitol Square Columbus`, `2079 E 9th St Cleveland`, `Columbus` | Nothing. Not confirmed whether OGRIP publishes those addresses. |

### Not checked

Real phones, Safari and Firefox, screen readers, a slow network, the Devpost page, and attendance. The history scan was pattern-based; one run of a dedicated secret scanner before B1 would be a cheap second check.
