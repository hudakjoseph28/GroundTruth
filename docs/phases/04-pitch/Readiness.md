# Submission readiness

**Audited:** Wed Nov 18, 2026, 10:20–10:50 p.m. ET (Nov 19, 03:20–03:50 UTC), as a signed-out judge.
**Internal deadline:** Fri Nov 20, 11:00 a.m. ET. Devpost closes 1:00 p.m. ET (noon CT). Finals at UT Austin, Sat Nov 21.

**What was audited:**

- **The live site** <https://groundtruth-lac.vercel.app> in headless Chrome at 1440 × 1000 and 390 × 844, on every page: home, search, the golden and Licking parcels, `/explore`, all five deal pages, `/review`, `/documents`, and an unknown URL. We checked page text, links, console errors, failed requests, and horizontal overflow.
- **The live API**, by route probes and live reports.
- **`main` at `74a8d94`** (after #54, #55, and #56), built locally and run against the production API with the same checks. This is what goes live at the next deploy. #59 and #50 merged at the end of the audit (`main` is now `132d3e9`). The overflow check was repeated on that build.
- **Devnet**, read directly from the public RPC: deal accounts, their signatures, and wallet balances.
- **GitHub**, signed out.

What was not checked: real phones, Safari and Firefox, the Devpost dashboard (it needs a team login), Railway and Vercel dashboards, the QuickNode Stream's state, and Twilio.

## Where we stand

- **The live site is a day behind `main`.** The web build is from Nov 18, 21:38 UTC, and the API reports `70943b9` (#39). The stage moment's main path, a reviewer tapping **Approve** in `/review` on a phone, shows "Page not found" on the live site today. So do `/explore`, the deal documents, and text alerts. Satya's two deploys (B1, B2) unblock most of this list.
- **What a judge sees today works.** The held and released deal pages are live and match the chain: `Refunded` with `DealHeld (6019)`, and `Released` with three approvals. Every Explorer link matches a signature on the deal account. Search, both seeded parcels, the 404 page, and every source link load at both widths with no page errors and no sideways scroll.
- **The stage deal is ready.** `staged-devnet-deal-live` (`2UrftJ…F6Cg`) is funded with 10 test USDC, and the title and survey reviewers have signed. Only the septic approval and the release are left. The septic wallet has 0.049985 devnet SOL for fees.
- **Rehearsal is not ready.** No deal is left on which to practise the septic tap, and the buyer has only 5 test USDC (H4).
- **The repo is public.** <https://github.com/hudakjoseph28/GroundTruth> opens signed out, and so do the site's GitHub, Data contract, and Team links.

## Ranked list

Owners: **Joey** web UI · **Kadhir** escrow · **Satya** API, QuickNode, ElevenLabs, deploys · **Gagan** parcel data and submission. **Agent** marks items fixed in the PR that updates this file.

### Blockers: the submission or the stage demo fails without these

| # | What's wrong | Where | Owner | Exact fix |
| --- | --- | --- | --- | --- |
| B1 | **The live web is missing every web change merged after Nov 18, 21:38 UTC** (#40, #42, #43, #45, #47, #49, #51–#56, and #59). `/review` and `/explore` show "Page not found", so the phone-tap stage path cannot run. There is no reviewer portal, documents section, text-alert opt-in, report summary, money-flow strip, or `/explore` map. | <https://groundtruth-lac.vercel.app/review>; `index.html` has `last-modified: Wed, 18 Nov 2026 21:38:18 GMT`, and its bundle has no "Connect Phantom" string. | Satya | **Do B2 first:** a new web build against the old API shows "The documents could not be loaded. That route is not available." on every deal page. Then, from the repo root on `main`, follow [backend/README.md § Deployment](../../../backend/README.md#deployment): `rm -rf /tmp/gt-web && mkdir /tmp/gt-web && git archive main \| tar -x -C /tmp/gt-web && cp -r .vercel /tmp/gt-web/ && (cd /tmp/gt-web && vercel deploy --prod --yes)`. Check: `/review` reads "Reviewer portal", and `/explore` draws parcel outlines at zoom 15 or closer. |
| B2 | **The live API is at #39 (`70943b9`).** It is missing #40, #41, #43, #46, #47, #49, #50, #51, and #53. | `GET /api/parcels/area`, `/api/deals/:id/documents`, and `POST /api/deals/:id/sms-subscriptions` answer "That route is not available". `/api/deals/staged-devnet-deal-rehearsal` and `…-rehearsal-v2` answer `404`. A fresh live report for `ohio:39049:230-000919` has no road-access or wetlands check. | Satya | `railway up --service api --ci` from `main`. `start:prod` runs `prisma migrate deploy`, which adds the `deal_sms_alerts` and `deal_documents` tables, and seeds both rehearsal deals. Then run `railway variables --service api --set "GIT_COMMIT=$(git rev-parse --short HEAD)"`. With `DATABASE_URL` pointed at Railway, run `pnpm --filter @groundtruth/backend replay:devnet --deal staged-devnet-deal-rehearsal`, then the same for `staged-devnet-deal-rehearsal-v2`; their chain rows are on devnet but not in the database. Check: the three routes above answer `200`, and the `230-000919` report has `access` and a wetlands check. |
| B3 | **There is no video.** | Not in the repo, README, or Devpost.md. | Gagan, with Satya for the call audio | Record from [VideoScript.md](VideoScript.md). Shots 1–6 and 8–13 can be filmed on the live site today. Shot 7 needs the audio clip of call `conv_9801m7rbaxvye0yrq4jmyzfyq6xz`. Upload to YouTube as Unlisted, play it signed out in a private window with sound, and paste the link into Devpost and the README. |
| B4 | **The Devpost entry is not confirmed.** | This audit could not see a draft. `devpost.com/software/groundtruth` is another team's project ("true."), so pick a different URL slug. | Gagan | Create the project from [Devpost.md](Devpost.md). Add Joey, Kadhir, and Satya and have each accept. Select **Consumer Applications** and **Best Use of Solana**, and **ElevenLabs** (its proof is recorded). Add **QuickNode** only after H1. Paste the app, repo, and video links, then **submit** (a draft does not count) before 11:00 a.m. ET Friday. Screenshot the submitted page into `docs/proof/`. |
| B5 | **Eligibility and attendance in Austin are not confirmed.** | No record in the repo. The [UBC brief](../../ubc/UBC-Hackathon.md#demo-and-submission) requires both. | Gagan, for all four | Confirm with the organizers who is presenting in person on Nov 21 and the stage call time, and write it here. |

### High: a judge will notice, a prize depends on it, or the stage is at risk

| # | What's wrong | Where | Owner | Exact fix |
| --- | --- | --- | --- | --- |
| H1 | **QuickNode's second-device check has not been done**, so the QuickNode bounty cannot be entered. | [Devpost.md](Devpost.md) `[PENDING]` (QuickNode section and "What's next"); README Sponsor integrations, "Not yet measured". | Satya and Gagan | After B1, B2, and H2, open <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-rehearsal-v2> on a second phone. From the laptop, release it, its only step left: `pnpm --filter @groundtruth/escrow demo:deals stage-finish --deal staged-devnet-deal-rehearsal-v2`. Record the signature, the block time, when the phone showed `Released`, and the Railway `quicknode applied` log line. Then remove the two `[PENDING]` labels and "not yet measured". This uses up rehearsal-v2, which can no longer practise the septic tap anyway. |
| H2 | **The Stream still runs the filter from before #53**, so approvals carry no document citation. | [backend/README.md § Deal documents](../../../backend/README.md#deal-documents-staged-demo), "Deploy note". | Satya | Paste `backend/quicknode/groundtruth-filter.js` from `main` into the Stream's filter and save. Test it on the block that holds rehearsal-v2's septic approval (`3WEAsdUE…`, Nov 19, 02:56:24 UTC). Its output must include `memos: ["groundtruth:doc:0d48ad98…"]`. |
| H3 | **There is no written plan for resuming the Stream on Saturday.** No one is named and no time is set. The pre-show checklist only says "resumed". | [DemoRunbook.md](DemoRunbook.md) pre-show checklist, first item. | Satya | Write it into the checklist: who resumes the Stream, and when (at least 60 minutes before the slot). Then prove delivery without touching the stage deal: run `stage-prep` on a fresh rehearsal deal (H4) and watch its four rows arrive on the deal page. If delivery fails, the stage line drops QuickNode, as the runbook's fallback already says. |
| H4 | **No deal is left to rehearse the septic phone tap, and the buyer has 5 test USDC.** Each rehearsal deal needs 10. | Buyer `HEDe3DMbVbFRku2Kzxq6usSjUdDJ1vphohTBxAXqEtXJ`: 5 test USDC and 1.83 SOL (devnet RPC, Nov 19, 03:35 UTC). Rehearsal v1 is released. Rehearsal-v2 has all three approvals (`3WEAsdUE…`), so only its release is left. | Kadhir | Get at least 15 test USDC for the buyer from <https://faucet.circle.com> (Solana Devnet), enough for v3 and a spare. Add `staged-devnet-deal-rehearsal-v3` the way #46 added v2: a fixture in `packages/shared`, the `--deal` option in `escrow/scripts`, and the PDA test. After it merges and deploys (B2), run `demo:deals stage-prep --deal staged-devnet-deal-rehearsal-v3`. Rehearse the tap on the phone. |
| H5 | **Phantom on the presenter's phone is not set up.** It cannot be until B1 ships `/review`. | [DemoRunbook.md § Septic reviewer's staged key](DemoRunbook.md#septic-reviewers-staged-key-in-phantom-for-the-stage) | The presenter (H6) | Follow steps 1–7. The imported account must be `Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F`. Fees are covered: it has 0.049985 devnet SOL. Practise on rehearsal-v3 (H4), never on `staged-devnet-deal-live`. |
| H6 | **No presenter or demo driver is named.** [Pitch.md](Pitch.md) asked for both by Nov 18. | [Pitch.md](Pitch.md), line 3; [DemoRunbook.md](DemoRunbook.md), line 3. | Gagan, with the team | Write both names into Pitch.md and the runbook's first paragraph. |
| H7 | **The staged wallets have no off-laptop backup.** All five keypairs (`buyer`, `seller`, `title`, `survey`, `septic`) exist only on Gagan's laptop, inside Conductor workspace folders (`delhi`, `agent-one`, `coverage-note`) that are deleted when a workspace is archived. Losing `septic.json` means neither the phone tap nor `stage-finish` can finish the stage deal. | `~/conductor/workspaces/UBC-Hackathon-main/*/escrow/.demo-wallets/` | Gagan | Copy them to an encrypted store you control off the laptop, such as a password-manager secure note or an encrypted USB drive. Also copy them to a folder outside Conductor (`chmod 700`). Check each with `solana-keygen pubkey`: buyer `HEDe…EtXJ`, seller `6XPG…pMMj`, title `Exxn…kBRW`, survey `CT6N…ohDa`, septic `Ab7K…Yz3F`. Never commit, paste, or project them. |
| H8 | **Twilio variables are unconfirmed.** Once B1 and B2 ship, every deal page shows **Text me updates**. Without `TWILIO_*`, every opt-in fails with the API's `503`. | Deal pages after B1; [backend/README.md § Deal text alerts](../../../backend/README.md#deal-text-alerts-staged-demo-twilio) | Satya | Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` together in Railway; a partial set stops the API. Opt your own number in on rehearsal-v2 before H1, and confirm the release text arrives. If it is not set by Thursday night, ask Joey to hide the panel. |
| H9 | **Large document uploads through the site are untested.** The API accepts up to 10 MB, but uploads go through Vercel's `/api` rewrite to Railway. Vercel documents a 4.5 MB request-body limit for its functions. Whether that limit applies to an external rewrite was not tested. | `vercel.json` rewrite; `DEAL_DOCUMENT_MAX_BYTES` in `packages/shared` | Satya | After B1 and B2, upload a 9 MB PDF as a deal participant on a rehearsal deal through `groundtruth-lac.vercel.app`. If Vercel refuses it (`413` or `FUNCTION_PAYLOAD_TOO_LARGE`), lower `DEAL_DOCUMENT_MAX_BYTES` and the web's size copy to 4 MB. |
| H10 | **Devpost.md claims live checks that are not deployed yet.** It says the live pipeline adds wetlands everywhere and road and stream-buffer checks in Franklin. On the live API today, neither exists (B2). | [Devpost.md](Devpost.md), "How we built it", paragraph 3 | Gagan | After B2, confirm the `230-000919` report shows both checks before pasting that paragraph into Devpost. If B2 slips past Thursday night, cut those words. |
| H11 | **The homepage diagrams lost their visible "Illustration" labels.** #59 removed "Illustrative activity." under the hero tags and "Illustration." under the How-it-works and reviewer diagrams. The hero still shows `Exxn…kBRW approved · Seller authority` (the real staged title reviewer's wallet) and `Escrow funded · 25 test USDC` as if they happened. Only screen readers still hear "Illustration". AGENTS.md says to keep staged roles and test funds visibly labeled. | `frontend/web/src/content/attestations.ts` (`ATTESTATION_COPY`), `home.ts` (`HOW…note`, `REVIEWERS`); commit `a7c54dc`. On `main`, not live. | Joey | Put back one short visible label per diagram, such as "Illustration", even if smaller or quieter. Or replace the wallet in the hero tag with an obviously made-up short form. |
| H12 | **Fixed by Agent.** With reduced motion on (iOS and macOS "Reduce Motion"), every page on `main` scrolled sideways: 2,315 px wide at a 390 px viewport, and 2,353 px at 1440. The ticker's hidden "View transaction" labels escaped its clip. | `frontend/web/src/layout/layout.css` (`.ticker-still`). Not on the live site yet, because the ticker (#52) is not deployed. | Agent | `.ticker-still` gets `position: relative`. All 28 page checks (14 pages at two widths) now show no overflow. |
| H13 | **Fixed by Agent.** The golden parcel showed "Not on-chain yet" on Road access, Can you build here?, Flood, Water & sewer, and Easements. No reviewer or escrow ever signs those on-chain, so "yet" promised a step that does not exist. | `frontend/web/src/parcel/Ledger/RecordCard.tsx` | Agent | Checks a deal's reviewer or escrow does not settle now show only Evidence and Review, like a parcel with no deal. Seller authority, Survey, Septic, and Closing keep the on-chain step. |
| H14 | **Fixed by Agent.** Devpost.md kept `[PENDING] Closing in the product` after the deal pages went live. | [Devpost.md](Devpost.md) | Agent | Removed, after checking both deal pages on the live site and every Explorer link against the deal accounts' signatures on devnet. The QuickNode `[PENDING]` labels stay (H1). |
| H15 | **Fixed by Agent.** Devpost.md had no "what's different" answer, which the [UBC brief](../../ubc/UBC-Hackathon.md#demo-and-submission) requires. | [Devpost.md](Devpost.md) | Agent | Added "What makes it different", built only from facts already proven in the doc. |

### Polish: fix if time allows

| # | What's wrong | Where | Owner | Exact fix |
| --- | --- | --- | --- | --- |
| P1 | The golden report says Seaman Rd is "about 107 m" away and the setback covers "about 5%". QA-Proof measured 105.75 m and 4.661%, and Devpost says "about 106 metres". | `packages/shared/src/fixtures/golden-parcel.json`, lines 41, 52, 72, and 94; [QA-Proof.md](QA-Proof.md), line 15 | Gagan | Change them to "about 106 m" and "about 4.7%", re-run `db:seed` on Railway, and update [DemoRunbook.md](DemoRunbook.md) line 130. Otherwise say "just over 100 metres" on stage, as the scripts already do. |
| P2 | The held deal's first row reads "Deal set up · Nov 11, 7:00 PM EST", the day before kickoff. | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal> | Satya (B2) | #43 records real setup times. Check the row after B2. |
| P3 | The live API returns the Licking address twice: `93 WOODY KNOLL DR THORNVILLE, OH 43076 THORNVILLE 43076`. | `GET /api/parcels/search?q=93 Woody Knoll Dr` | Satya (B2) | #43 cleans it. Check after B2. |
| P4 | The golden parcel's ledger cards describe the held deal only ("Survey · Not signed", "Closing · Refunded"). The closings strip just above shows a released deal with Survey signed. | `/parcels/ohio%3A39049%3A230-000918` | Joey | Label the reviewer cards with the deal they read, for example "From the held closing (staged-devnet-deal)", or read them from the newest deal. |
| P5 | The homepage "Built with" lists **Grok** ("Our AI teammate for prompts and planning") and **Cursor**. [Pitch.md](Pitch.md) rules out the Grok Bot bounty, and a judge may read the Grok card as an integration. | `frontend/web/src/content/built.ts` (on `main`, not live) | Joey and Gagan | Keep it as an honest tool credit, or drop the two cards. Do not select Grok on Devpost. |
| P6 | `/api/health` reports a commit set by hand. | Railway `GIT_COMMIT` | Satya | Set it at every deploy (B2). |

## Deploy status

| Surface | Deployed | `main` | Merged but not live |
| --- | --- | --- | --- |
| Web (Vercel) | Built Nov 18, 21:38 UTC | `132d3e9` | #40, #42, #43, #45, #47, #49, #51, #52, #53, #54, #55, #56, #59 |
| API (Railway) | `70943b9` (#39); route probes agree | | #40, #41, #43, #46, #47, #49, #50, #51, #53 |
| QuickNode filter | Not verified. The README's deploy note says to re-paste it after #53 (H2). | `groundtruth-filter.js` with memos | #53 |
| Database | Migrations up to `land_assets` (inferred from the routes) | Adds `deal_sms_alerts` and `deal_documents` | Applied by `start:prod` on deploy |

Both surfaces are deployed by hand from a CLI (Satya). Merging does not deploy.

## Open PRs

| PR | Status | Blocking |
| --- | --- | --- |
| [#57](https://github.com/hudakjoseph28/GroundTruth/pull/57) Parcel land view: toggleable map layers | Open, mergeable, CI running at audit time, no review | A review and green CI. It touches `packages/shared`, so it needs B1 and B2 again after merging. |
| [#58](https://github.com/hudakjoseph28/GroundTruth/pull/58) Flood: SFHA and floodway lots need review | Open, CI green on its branch, **conflicts with `main`**, no review | A rebase onto `main` (#50 touched the report pipeline), then a review. |
| [#60](https://github.com/hudakjoseph28/GroundTruth/pull/60) Golden parcel: seeded SSURGO septic screening | Open, mergeable, CI running at audit time, no review | A review and green CI. It changes the seeded golden report, so film the video after it lands or not at all, and re-seed (B2). |

All three are Gagan's. #50, #54, #55, #56, and #59 merged during this audit and are part of B1 and B2. **Set a merge freeze before filming (B3) and before Satya's final deploy.** Each later merge means another deploy and another check of the stage path.

## Demo readiness (on-chain, Nov 19, 03:35 UTC)

| Item | State | Evidence |
| --- | --- | --- |
| Stage deal `staged-devnet-deal-live` | **Ready for `stage-finish`.** Funded with 10 test USDC; title and survey signed. | Account `2UrftJ…F6Cg` has exactly 4 signatures: `jmK7fg`, `5waYrx`, `2VSXvY`, and `Gj327z` (Nov 18, 18:57:19–18:57:22 UTC). The live API says `funded`. |
| Rehearsal v1 | Released, used up | Last signature `3z7BNJH6…` (release), Nov 18, 23:17 UTC |
| Rehearsal v2 | Release left. Not on the live API (B2). | Septic approval `3WEAsdUE…` with memo `groundtruth:doc:0d48ad98…`, Nov 19, 02:56 UTC |
| Buyer test USDC | **5**, which is not enough for another 10-USDC rehearsal (H4) | `HEDe…EtXJ` |
| Septic fee SOL | 0.049985, enough | `Ab7K…Yz3F` |
| Phantom on the phone | Not set up (H5) | Needs B1 |
| `.demo-wallets` backup | Only on Gagan's laptop (H7) | |
| Stream resume plan | Not written (H3) | |

## Definition of a winning build

From the [README](../../../README.md#definition-of-a-winning-build).

| Item | Status | Evidence |
| --- | --- | --- |
| Public URL loads signed out; search is obvious in five seconds | **Pass** | Every page returns `200` with no page errors. The search box and the gold "Find parcel" button are in the first screen at both widths. |
| Search returns real OGRIP boundaries from two counties; golden report shows a dated source, a gap, and the next person | **Pass** | `230-000918` (Franklin) and `93 Woody Knoll Dr` (Licking) return results from the live API in 0.3–0.4 s. `750 High St, Columbus` returns N and S High St in 1.1 s. |
| Held deal rejects release on-chain with balances unchanged | **Pass, and shown in the product** | The live deal page shows `Release rejected · DealHeld (6019)`, linked to `Rro8WA…vwGz`, which the devnet RPC shows as failed. |
| Cleared deal pays the exact amount once; every claim has an Explorer link | **Pass, and shown in the product** | The live deal page shows `Released` and `3 of 3 signed`, linked to `5kWpcH…vHdC`. |
| ElevenLabs call creates reviewer evidence, never an approval | **Pass** | The live held-deal page shows `Evidence received` from the owner callback, marked `Off-chain record · not a chain event`. |
| QuickNode Stream drives the timeline on a second device | **Not yet** | H1 |
| Video, repo, and app all open signed out | **Partly** | App and repo: pass. Video: does not exist (B3). |

## Submission checklist

From the [UBC brief](../../ubc/UBC-Hackathon.md#demo-and-submission).

| Item | Status | Evidence |
| --- | --- | --- |
| Name, description, members, technologies, track, Solana, bounties | **Not confirmed** | B4 |
| Written answers: build, problem, how it works, what's different, what's next | **Drafted** | [Devpost.md](Devpost.md) now has all five. |
| Public repo with setup; README with architecture, program IDs, network, sponsor configuration | **Pass** | Public signed out. The README has setup, the program ID, devnet, and a Sponsor integrations table. Its parcel paragraph now separates what is live from what is only on `main`. |
| Working demo plus a 2–3 minute video with audible ElevenLabs output | **Partly** | The demo works on the live site. There is no video yet (B3). |
| Eligibility and attendance verified; demo, repo, video open signed out | **Not yet** | B5; video B3 |
