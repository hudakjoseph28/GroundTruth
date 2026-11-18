# GroundTruth five-minute stage demo

**Run time:** 4:40, plus the final 20 seconds as latency buffer. **Roles:** the **presenter** speaks and holds the phone; the **demo driver** operates the projected laptop, browser tabs, audio, and terminal. All money and roles shown here are staged on Solana devnet.

This runbook was checked against <https://groundtruth-lac.vercel.app> and its public API on Nov 18, 2026. The parcel sequence reuses `DemoScript-Parcel.md`. The current deployed states are:

- `staged-devnet-deal` is **Refunded**. Its immutable timeline still shows the title hold, the rejected release with `DealHeld (6019)`, and the later buyer refund.
- `staged-devnet-deal-live` is **Funded** for **10 test USDC**, with title and survey signed and septic waiting.
- `staged-devnet-deal-released` is the preserved fallback: **Released** for **25 test USDC** after all three approvals.
- The live API does **not** yet contain an ElevenLabs `Evidence received` row, and there is no public recording URL. Do not claim a live callback until the audio gate below passes.

## Pre-show checklist

- [ ] QuickNode Stream is **resumed**, on **Solana Devnet / Block**, using `backend/quicknode/groundtruth-filter.js`, and delivering to `https://api-production-db8a8106.up.railway.app/api/webhooks/quicknode`.
- [ ] The phone is awake, rotation-locked, at 100% browser zoom, and loaded on <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-live>. It shows `10 test USDC`, `Funded`, `Waiting on 1 sign-off`, `2 of 3 signed`, and `Septic reviewer · Waiting`.
- [ ] Laptop and phone are on working Wi-Fi. Turn off VPN, notifications, Low Power Mode, and auto-lock for the presentation.
- [ ] Laptop is charged and plugged in. The terminal is open at the repository root with dependencies already installed.
- [ ] `escrow/.demo-wallets/` is present and contains the five existing staged keypair files: `buyer.json`, `seller.json`, `title.json`, `survey.json`, and `septic.json`. Do not open, copy, project, or commit them.
- [ ] Run the read-only backstage check `pnpm --filter @groundtruth/escrow demo:deals`. It must report `stage-finish ready (septic approval and release)`. **Do not run `stage-finish` before the live segment.**
- [ ] **Warm the cache at least 10 minutes before presenting.** On the laptop, open each parcel below once and wait until its land block finishes loading. The first open builds the 3D land (USGS aerial imagery and elevation) and caches it on the API. A cold build can take longer than the 10 seconds the page waits, and the live report is also cached for 24 hours.
  - 230-000918, the demo parcel (baked into the site; this is a render check): <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>
  - 84 W Dodridge St, Columbus (search example): <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A010-042534>
  - 10034 Appleton Rd, Johnstown (search example): <https://groundtruth-lac.vercel.app/parcels/ohio%3A39089%3A00100000601000>
  - 93 Woody Knoll Dr, Licking County, the second fixture parcel (baked; render check): <https://groundtruth-lac.vercel.app/parcels/ohio%3A39089%3A00500729609000>
  - Any other parcel you plan to search on stage.

  If a parcel shows its boundary flat with "The 3D land isn't ready for this parcel yet," wait a minute and reload until the 3D block appears. Its build kept running and is cached. 3D for parcels other than the two baked ones needs the on-demand land endpoint (#37) deployed to Railway. Until then they stay flat however many times they are opened.
- [ ] Open these projected laptop tabs in this order:
  1. <https://groundtruth-lac.vercel.app>
  2. <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>
  3. <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal>
  4. [Held release on Solana Explorer](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet)
  5. <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released>
  6. [Preserved release on Solana Explorer](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet)
- [ ] Browser zoom is 100%, the deal timeline and parcel drawers are readable on the projector, and the terminal font is at least 18 pt.
- [ ] **Audio gate:** use only a recording of the real ElevenLabs call to a consenting teammate, clearly labeled `Recorded ElevenLabs owner callback · staged participant`. Record its conversation ID on the private show sheet. If that artifact still does not exist, use the no-audio fallback below and do not enter or claim the ElevenLabs bounty.
- [ ] Rehearse the hand signals: presenter raises one finger for “advance,” a flat palm for “hold this screen,” and two fingers for “take the fallback.”

## 0:00–0:30 · The buyer's story

**URL:** <https://groundtruth-lac.vercel.app>

**Demo driver**

1. Reload the homepage before the clock starts.
2. At 0:00, leave the cursor away from the search field. Do not scroll or click during the opening.

**On screen**

- `Vacant land · Ohio · Solana escrow`
- `Know the land before the money moves.`
- The `Parcel ID or address` field and gold `Find parcel` button
- `Public records cited`, `Reviewers sign`, and `USDC escrow on Solana`

**Presenter — say exactly these two lines**

> “You find a vacant lot you can finally afford. Before you send a deposit, you need two answers: can I build here, and does the person asking for my money own it?”

> “GroundTruth puts the parcel evidence, the responsible professional, and the payment condition in one place—without asking the buyer to understand GIS or crypto.”

**Fallback:** If the homepage is not ready, the demo driver switches to the preloaded direct parcel tab and the presenter finishes the two lines over that screen. Do not spend the opening refreshing.

## 0:30–1:15 · Search and the parcel report

**URLs:** start at <https://groundtruth-lac.vercel.app>; search resolves to <https://groundtruth-lac.vercel.app/search?q=230-000918>; the result opens <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>.

**Demo driver — every click**

1. Click `Parcel ID or address`, type `230-000918`, and click the gold `Find parcel` button.
2. On `Search`, click the result `230-000918`. It also reads `Franklin County` and `Matched parcel ID`.
3. Let `Loading parcel…` finish. If it takes more than two seconds, press any unmodified key or click the transition once to skip it.
4. Scroll just enough to show the `Road access` card. Click `Road access`.
5. In the drawer, point in order to `Needs review`, `What we know`, `What it does not establish`, `Sources`, and `Next action`. Do not open an external source.
6. Click `Close`. Click `Can you build here?`, point to `Evidence found` and `What we know`, then click `Close`.
7. Click `Flood`, point to `Evidence found` and `What it does not establish`, then click `Close`. Leave the parcel ledger clean for the next segment.

**On screen**

- Parcel `230-000918`, `Franklin County`, and parcel key `ohio:39049:230-000918`
- The published parcel boundary outlined in gold over real aerial imagery and terrain
- `Road access · Needs review · Biggest open question`
- No mapped right-of-way touches the parcel; Seaman Road is about 107 m away; GIS cannot establish a recorded easement or other legal access
- Rural zoning permits a one-family dwelling and the Auditor lists 3.015 legal acres, but the 150-foot frontage condition still applies
- FEMA maps Zone X, with the limitation that this is not zero flood risk or a flood-insurance determination

**Presenter — say exactly these three lines**

> “This is a real vacant lot in Franklin County, found by the parcel ID Ohio publishes, and this gold outline is the boundary from the statewide record.”

> “The fact that changes the plan is access: no mapped county right-of-way touches the lot and Seaman Road is just over 100 metres away—but GIS cannot show a recorded easement, so a title reviewer has to resolve legal access.”

> “Zoning is promising, not a green light: Rural allows one home and the Auditor lists 3.015 acres, while the frontage rule still applies; FEMA maps Zone X, which means minimal mapped hazard, not zero flood risk.”

**Fallbacks**

- Search slow or empty: click the homepage chip `230-000918`, or switch to the preloaded direct parcel tab. Say, “I’ll open the verified demo parcel directly and keep us moving.”
- Parcel transition slow: press one key or click it once; if the page still does not appear, use the preloaded parcel tab.
- Drawer or source slow: keep the drawer on screen and point to its authority, retrieval date, finding, limitation, and next action. Never open an external county or FEMA page during this segment.

## 1:15–2:45 · The held deal

**URLs:** <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal> and the [failed release on Solana Explorer](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet).

**Demo driver — every click**

1. On the parcel ledger, click `Open the deal timeline`. If it is off screen, switch directly to the preloaded held-deal tab.
2. **Only if the audio gate passed:** click Play on the preloaded, labeled recording and stop it immediately after the staged owner says they are not selling. Keep the held-deal page projected. There is no public recording URL in the current product.
3. Point to `Refunded`, `Refunded to the buyer`, the `Title reviewer · Hold placed` row, and the card `Hold on this deal · Seller identity disputed`.
4. Scroll to `Release rejected`. Point to `Blocked · no money moved` and the message ending `DealHeld (6019)`.
5. In that row, click `View transaction Rro8…vwGz`. Solana Explorer opens in a new tab on devnet. Pause on the failed transaction; expand `Program Logs` only if `DealHeld` is not already visible.

**On screen**

- `25 test USDC · Refunded` and `Refunded to the buyer`
- The explanation that the escrow returned 25 test USDC to the buyer while the hold was active and paid nothing to the seller
- `Hold on this deal · Seller identity disputed`, placed by the title reviewer
- `Release rejected · Blocked · no money moved`
- `A release was rejected on-chain because a reviewer's hold is active. No funds moved. Program error: DealHeld (6019).`
- Solana Explorer for signature `Rro8WA…vwGz` on devnet

**Presenter — say exactly these three lines**

> “The callback is evidence, not authority: ElevenLabs can report what the staged owner said, but only the assigned title reviewer can place this hold.”

> “This preserved deal has since refunded the buyer, but its history cannot be rewritten: the title reviewer disputed seller identity, and the program rejected release with `DealHeld` before that refund.”

> “The failed transaction is the proof—25 test USDC did not go to the seller, and the program, not our web page, enforced that result.”

**Fallbacks**

- No real recording—which is the current live state: skip step 2 and replace the first spoken line with, “The current public demo has no recorded ElevenLabs callback, so I will not claim one; this on-chain story begins with the title reviewer’s signed hold.” Do not play a reenactment or call it ElevenLabs.
- Deal page slow: switch to the preloaded held-deal tab. If the API is unavailable, use the preloaded Explorer transaction and say only what the transaction proves.
- Explorer slow: stay on the product's `Release rejected` row, which carries the same signature and error. The direct Explorer tab is already preloaded.

## 2:45–4:00 · Live final approval and 10 test-USDC release

**Phone URL:** <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-live>. **Terminal working directory:** repository root. **Command:**

```bash
pnpm --filter @groundtruth/escrow demo:deals stage-finish
```

**Presenter**

1. Hold up the already loaded phone. Do not refresh or tap; its page checks for updates every two seconds.
2. Point out `10 test USDC`, `Funded`, `Waiting on 1 sign-off`, `2 of 3 signed`, and `Septic reviewer · Waiting`.

**Demo driver — every click and key**

1. Switch the projector to the prepared terminal.
2. Click the prompt, type or paste `pnpm --filter @groundtruth/escrow demo:deals stage-finish`, and press Return once.
3. Stop typing. The command sends the septic approval and then release. It prints an `ok` line and a devnet signature for each.
4. Switch the projector back to the live-deal browser tab or the phone mirror. Do not refresh while the green `Live · Updated …` line is advancing.

**Presenter, after confirmation**

3. Wait for `Septic reviewer · Signed`, `3 of 3 signed`, and then `Released · Payment released` to appear. The newest timeline rows are labeled `Approval signed` and `Payment released` with `New` while fresh.
4. Tap `View transaction` in the newest `Payment released` row. This opens the newly generated release signature on Solana Explorer with `?cluster=devnet`.

**On screen**

- Before the command: `10 test USDC · Funded`, two signed reviewers, septic waiting
- Terminal: `ok sign_approval (septic)` followed by its signature, then `ok release released` followed by the release signature
- After Stream delivery and polling: `10 test USDC · Released`, `Payment released`, and `Every required reviewer signed, and the escrow paid 10 test USDC to the bound seller.`
- New timeline rows for the septic approval and payment, each marked `Confirmed on Solana devnet` and linked to Explorer

**Presenter — say exactly these three lines**

> “This is the same responsive deal page on a phone: 10 test USDC is funded, title and survey are signed, and septic is the one remaining reviewer.”

> “Our driver is sending that last reviewer signature and the release now; QuickNode carries the confirmed program events into the API, and the phone checks that timeline every two seconds.”

> “Now all three reviews are signed and exactly 10 test USDC went to the bound seller—the destination and amount were fixed before funding, and this Explorer receipt is independently verifiable.”

**Fallbacks**

- Command fails before either `ok` line: read the error. If it is a transient RPC or rate-limit error, rerun the same command once; it reads on-chain state and skips steps already confirmed. For any other error, do not improvise with wallet files.
- Septic approval succeeds but release does not: rerun the same command once. It safely skips the confirmed septic approval and attempts only the remaining release.
- Phone does not update within 10 seconds: refresh the phone once. If it still does not update, show the two terminal signatures and open the release signature directly at `https://explorer.solana.com/tx/<release-signature>?cluster=devnet`. Do not claim a QuickNode delivery unless the timeline actually updates.
- Stream, API, phone, or live deal is unavailable: switch to <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released>, which shows a **prior** released deal for **25 test USDC**, then open its [preserved release transaction](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet). Say, “This is our preserved Nov 18 run, not the live 10-USDC stage deal.”
- Explorer slow: keep the product timeline on screen and point to the full release signature. The terminal also saved the result under `escrow/demo-results/devnet-stage-live-v1.{json,md}`.

## 4:00–4:40 · Why Consumer, why Solana, and the pilot

**URL:** keep the new release open on Solana Explorer. If the live release used a fallback, keep that clearly labeled fallback receipt open.

**Demo driver**

1. Make no further clicks. Leave the release receipt readable.
2. At 4:40, start the 20-second latency buffer. Do not add an architecture tour.

**On screen**

- The released transaction on Solana devnet
- The transaction signature, program interaction, and successful status

**Presenter — say exactly these three lines**

> “This is a Consumer application because the buyer starts with an everyday question—can I use this land?—and gets evidence and a clear next action before ever seeing a wallet.”

> “Solana is not decoration: it makes the reviewer set, hold, amount, mint, and payout destination enforceable and independently verifiable, while private evidence stays off-chain.”

> “Our pilot is with an Ohio title or closing partner: start with vacant-land buyers, measure whether they understand the biggest open issue sooner, and let the professionals define the production release and refund terms.”

**Fallback:** If Explorer is unreadable, return to the released deal page and hold on `Payment released`, the amount, and the `Confirmed on Solana devnet` timeline row. The closing lines do not change.

## 4:40–5:00 · Latency buffer

Use this only for a slow search, transition, Stream delivery, polling interval, or Explorer load. If the demo reaches the receipt by 4:00, pause after the pilot line and finish early; do not fill the buffer with another feature.

## Two-minute screening version

Do **not** consume the one-time `stage-finish` transaction in the short version. Use the preserved held and released receipts.

| Time | Owner | URL and exact actions | What is on screen | Spoken line |
| --- | --- | --- | --- | --- |
| 0:00–0:15 | Driver: homepage, no clicks. Presenter speaks. | <https://groundtruth-lac.vercel.app> | Headline, search, public records, reviewer signatures, Solana escrow | “A first-time land buyer needs to know whether they can use the lot and whether the seller can be paid. GroundTruth makes the evidence and next professional clear before money moves.” |
| 0:15–0:40 | Driver: click `Parcel ID or address`, type `230-000918`, click `Find parcel`, click the result, skip the transition if needed, click `Road access`. | <https://groundtruth-lac.vercel.app/search?q=230-000918> → <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918> | Real boundary; `Road access · Needs review`; county sources and limitation | “No mapped right-of-way touches this real Franklin County lot and the road is just over 100 metres away. GIS cannot prove legal access, so title review owns the next step.” |
| 0:40–1:10 | Driver: switch to held deal, scroll to `Release rejected`, click `View transaction`. Presenter speaks. | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal> → [DealHeld transaction](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet) | Title hold; rejected release; `Blocked · no money moved`; later refund preserved in history | “A title reviewer—not the callback agent—placed a seller-identity hold. Solana rejected the payout with `DealHeld`, and the buyer later recovered the full 25 test USDC.” |
| 1:10–1:35 | Driver: switch to preserved released deal, click the newest `Payment released` row's `View transaction`. Presenter speaks. | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released> → [release transaction](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet) | `25 test USDC · Released`; all three reviewers signed; payment receipt | “In the independent cleared deal, all three reviewers signed and the program paid exactly 25 test USDC to the bound seller.” |
| 1:35–2:00 | Driver: leave Explorer open. Presenter closes. | Preserved release on Solana Explorer | Independently verifiable receipt | “The product is Consumer because it starts with the buyer and the parcel. Solana makes the professional decisions obeyable by the money, and an Ohio title or closing partner is the path to a real pilot.” |

If the ElevenLabs audio gate has passed, place a five-second excerpt immediately before the held-deal line and shorten the closing by five seconds. Otherwise omit it and do not claim the integration.
