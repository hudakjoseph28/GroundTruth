# GroundTruth five-minute stage demo

**Run time:** 4:40, plus the final 20 seconds as latency buffer. **Roles:** the **presenter** speaks and holds the phone; the **demo driver** operates the projected laptop, browser tabs, audio, and terminal. All money and roles shown here are staged on Solana devnet.

This runbook was checked against <https://groundtruth-lac.vercel.app> and its public API on Nov 18, 2026. The parcel sequence reuses `DemoScript-Parcel.md`. The current deployed states are:

- `staged-devnet-deal` is **Refunded**. Its timeline shows the title hold, the rejected release with `DealHeld (6019)`, and the later buyer refund, each independently verifiable on-chain. After them it shows the ElevenLabs `Evidence received` row (below).
- `staged-devnet-deal-live` is **Funded** for **10 test USDC**, with title and survey signed and septic waiting.
- `staged-devnet-deal-released` is the preserved fallback: **Released** for **25 test USDC** after all three approvals.
- **ElevenLabs is proven.** A real staged call to a consenting teammate (conversation `conv_9801m7rbaxvye0yrq4jmyzfyq6xz`) was verified and recorded at 22:10:54 UTC on Nov 18 as `ownerDeniesSale` on `staged-devnet-deal`. That was after the deal's hold and refund, so its `Evidence received` row appears after them. Proof: [Railway log](../../proof/elevenlabs-owner-callback.png). The audio gate has passed; use the recorded clip. The product still has no public recording URL.

## Rehearsing the live moment

Practise the 2:45–4:00 segment on the rehearsal deal, never on the live one. `staged-devnet-deal-rehearsal-v2` is a copy of `staged-devnet-deal-live`: the same 10 test USDC, reviewers, and two steps, on its own escrow (PDA `EPYNKVUCSUJvmuKa5NqJqNmswcdziLRJHUgwTkkC8J2X`).

1. Backstage, run `pnpm --filter @groundtruth/escrow demo:deals stage-prep --deal staged-devnet-deal-rehearsal-v2`. It sets up the deal: funded, title and survey signed, septic waiting.
2. On the laptop, open <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-rehearsal-v2> as the projected tab.
3. On the phone, in Phantom's in-app browser, open <https://groundtruth-lac.vercel.app/review> connected as the septic reviewer (see the next section). Use the `staged-devnet-deal-rehearsal-v2` card, not `staged-devnet-deal-live`.
4. Run the segment as written: **Approve as septic reviewer**, then **Release payment to the seller**, both on the phone.
5. To practise the fallback instead, skip the taps and run `pnpm --filter @groundtruth/escrow demo:deals stage-finish --deal staged-devnet-deal-rehearsal-v2` from the laptop. If a tap fails partway, the same command finishes whatever step is left.
6. Check that the projected deal page updates, and time it. The run is recorded under `escrow/demo-results/devnet-stage-rehearsal-v2.{json,md}`.

The rehearsal deal can run once, by either path. **`staged-devnet-deal-rehearsal` (v1) is used up.** On Nov 18 it tested the reviewer portal (#45): `stage-prep`, then the septic approval and the release through `/review` ([approval](https://explorer.solana.com/tx/5im6Vt5iBhkRxmcJxRzPcgf2demRR4bBY2oTtZZX5Y4DkuyrDnxcB8Dst2qAPnn8krAJe4ocswMh9TY1rjKmskYY?cluster=devnet), [release](https://explorer.solana.com/tx/3z7BNJH6xrXmoMHY9cvpD37c775prm2PgS4c2xL1SFTEevoe3UnJc2cUgWLXUfYEuzLncLw7J1djRDqhZ4FGsr4z?cluster=devnet)). Do not pass `--deal staged-devnet-deal-rehearsal` again. Each rehearsal needs 10 test USDC free in the buyer's wallet, on top of the live deal's 10 already in escrow.

**Rehearsal-v2 status (2026-11-19):** stage-prep ran, and its septic approval was then signed from `/review` while testing deal documents (approval tx `3WEAsdUE…9Q9w`, relying on a fake “Septic evaluation.pdf”). It is funded with all three approvals, so only the release is left; the septic tap can no longer be practised on it.

**Prerequisite:** `staged-devnet-deal-rehearsal-v2` comes from #46. The `--deal` flag accepts it only once #46 is merged. The deal page and `/review` show it only after the API is redeployed and seeded with that build.

## Septic reviewer's staged key in Phantom (for the stage)

The reviewer portal (<https://groundtruth-lac.vercel.app/review>) lets the septic reviewer sign the live deal's last approval from Phantom on stage, then submit the release. This is the **main stage path** for the 2:45–4:00 segment. `stage-finish` from the laptop is the fallback. The septic reviewer's staged keypair is `escrow/.demo-wallets/septic.json`, on the laptop that ran the demo deals. It is gitignored. Never commit, project, paste into chat, or screen-share it.

1. **Use a demo-only Phantom wallet** on the device that will sign: the presenter's phone, or the driver's laptop. Never use a wallet that holds real funds.
2. **Put Phantom on devnet:** Settings → Developer Settings → **Testnet mode** on, network **Solana Devnet**. The portal always sends to devnet, but Phantom's own preview should match.
3. **Copy the key to the clipboard without showing it.** On the laptop, from the repository root:

   ```bash
   cd escrow && node -e 'const { utils } = require("@anchor-lang/core"); process.stdout.write(utils.bytes.bs58.encode(Uint8Array.from(require("./.demo-wallets/septic.json"))))' | pbcopy
   ```

   It converts the keypair file to the base58 private key Phantom imports, straight into the clipboard. Get it to the phone only over a private channel you control, such as AirDrop to yourself, and never paste it anywhere else.
4. **Import it:** Phantom → account menu → **Add / Connect Wallet** → **Import Private Key** → paste → name it `GroundTruth septic (staged)`. Then clear the clipboard with `pbcopy < /dev/null`.
5. **Check the address.** The imported account must be `Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F`, the septic reviewer bound to the deals. Any other address means the wrong file.
6. **Fee SOL:** the reviewer pays its own network fee. The septic wallet has about 0.05 devnet SOL, enough for hundreds of fees. Top it up at <https://faucet.solana.com> if it drops below 0.01.
7. **Before the segment:** in Phantom's in-app browser, open <https://groundtruth-lac.vercel.app/review> and tap **Connect Phantom**. The `staged-devnet-deal-live` card must show `10 test USDC`, `Funded`, Title and Survey `Signed`, Septic `Waiting`, and **Approve as septic reviewer**. Do not tap it until the segment.
8. **On stage:**
   - tap **Approve as septic reviewer** and approve in Phantom;
   - wait for `Confirmed on Solana devnet`;
   - tap **Release payment to the seller** and approve again.

   Each step shows its signature and an Explorer link, and the deal page updates through the Stream as usual.
9. **After the show,** remove the imported account from Phantom (Settings → Manage Accounts → the account → Remove).

**Prerequisite:** the portal reads deals from the production API, so it needs this web build deployed (Vercel). The live deal is already seeded there.

**If Phantom or the portal fails on stage:** the demo driver runs `pnpm --filter @groundtruth/escrow demo:deals stage-finish` from the laptop, as written in the segment's fallbacks below. It skips any step the phone already confirmed.

## Pre-show checklist

- [ ] QuickNode Stream is **resumed**, on **Solana Devnet / Block**, using `backend/quicknode/groundtruth-filter.js`, and delivering to `https://api-production-db8a8106.up.railway.app/api/webhooks/quicknode`.
- [ ] The phone is awake, rotation-locked, and open in **Phantom's in-app browser** on <https://groundtruth-lac.vercel.app/review>, connected as `GroundTruth septic (staged)` (`Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F`) with Phantom on Solana Devnet. The `staged-devnet-deal-live` card shows `10 test USDC`, `Funded`, Title and Survey `Signed`, Septic `Waiting`, and **Approve as septic reviewer**. Do not tap it.
- [ ] The septic wallet has at least 0.01 devnet SOL for fees.
- [ ] Laptop and phone are on working Wi-Fi. Turn off VPN, notifications, Low Power Mode, and auto-lock for the presentation.
- [ ] Laptop is charged and plugged in. The terminal is open at the repository root with dependencies already installed.
- [ ] `escrow/.demo-wallets/` is present and contains the five existing staged keypair files: `buyer.json`, `seller.json`, `title.json`, `survey.json`, and `septic.json`. Do not open, copy, project, or commit them.
- [ ] Run the read-only backstage check `pnpm --filter @groundtruth/escrow demo:deals`. It must report `stage-finish ready (septic approval and release)`, so the laptop fallback is ready. **Do not run `stage-finish` before the live segment.**
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
  5. <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-live>. It shows `10 test USDC`, `Funded`, `Waiting on 1 sign-off`, `2 of 3 signed`, and `Septic reviewer · Waiting`.
  6. <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released>
  7. [Preserved release on Solana Explorer](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet)
- [ ] Browser zoom is 100%, the deal timeline and parcel drawers are readable on the projector, and the terminal font is at least 18 pt.
- [ ] **Audio gate: passed.** Preload the recorded clip of the real ElevenLabs call to a consenting teammate (conversation `conv_9801m7rbaxvye0yrq4jmyzfyq6xz`), clearly labeled `Recorded ElevenLabs owner callback · staged participant`. Check that it plays on the projector's audio out. Keep the conversation ID on the private show sheet.
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
- `Septic · Needs review`: USDA SSURGO maps Ko 46.05%, CrB 38.31%, and CeB2 15.64% of the lot, all “Very limited” for septic-tank absorption fields (Living Atlas SSURGO copy, retrieved Nov 19); next action is Franklin County Public Health's site and soil evaluation. Access stays the biggest open question.

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
2. Click Play on the preloaded, labeled recording and stop it immediately after the staged owner says they are not selling. Keep the held-deal page projected. There is no public recording URL in the current product.
3. Point to `Refunded`, `Refunded to the buyer`, the `Title reviewer · Hold placed` row, and the card `Hold on this deal · Seller identity disputed`. Then point to the `Evidence received` row from the owner callback, which sits after the refund.
4. Scroll to `Release rejected`. Point to `Blocked · no money moved` and the message ending `DealHeld (6019)`.
5. In that row, click `View transaction Rro8…vwGz`. Solana Explorer opens in a new tab on devnet. Pause on the failed transaction; expand `Program Logs` only if `DealHeld` is not already visible.

**On screen**

- `25 test USDC · Refunded` and `Refunded to the buyer`
- The explanation that the escrow returned 25 test USDC to the buyer while the hold was active and paid nothing to the seller
- `Hold on this deal · Seller identity disputed`, placed by the title reviewer
- `Evidence received` from the owner callback: the person reached as the owner on record said they are not selling. It was recorded after the hold and refund, as evidence only.
- `Release rejected · Blocked · no money moved`
- `A release was rejected on-chain because a reviewer's hold is active. No funds moved. Program error: DealHeld (6019).`
- Solana Explorer for signature `Rro8WA…vwGz` on devnet

**Presenter — say exactly these three lines**

> “In a real closing, this callback is what prompts the title reviewer to hold; our staged call was recorded today, so it appears after the hold.”

> “This preserved deal has since refunded the buyer, and its history is independently verifiable on-chain: the title reviewer disputed seller identity, and the program rejected release with `DealHeld` before that refund.”

> “The failed transaction is the proof—25 test USDC did not go to the seller, and the program, not our web page, enforced that result.”

**Fallbacks**

- Clip will not play: skip step 2, point to the `Evidence received` row, and keep the first spoken line; the row and the Railway log are the proof. Never play a reenactment or call one ElevenLabs.
- Deal page slow: switch to the preloaded held-deal tab. If the API is unavailable, use the preloaded Explorer transaction and say only what the transaction proves.
- Explorer slow: stay on the product's `Release rejected` row, which carries the same signature and error. The direct Explorer tab is already preloaded.

## 2:45–4:00 · Live final approval and 10 test-USDC release

**Main path: the presenter taps on the phone.** Phone: Phantom's in-app browser on <https://groundtruth-lac.vercel.app/review>, connected as the staged septic reviewer. Projector: the laptop's live-deal tab, <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-live>.

**Fallback: `stage-finish` from the laptop.** Terminal working directory: repository root. Command:

```bash
pnpm --filter @groundtruth/escrow demo:deals stage-finish
```

**Demo driver**

1. Switch the projector to the live-deal tab. Do not refresh while the green `Live · Updated …` line is advancing.
2. Point out `10 test USDC`, `Funded`, `Waiting on 1 sign-off`, `2 of 3 signed`, and `Septic reviewer · Waiting`.
3. Keep the prepared terminal one keystroke away, with the fallback command typed but **not** run.

**Presenter — every tap**

1. Hold up the phone on the `staged-devnet-deal-live` card.
2. Tap **Approve as septic reviewer**, then approve in Phantom.
3. Wait for `Confirmed on Solana devnet. The deal page updates when the Stream delivers it.`
4. Tap **Release payment to the seller**, then approve in Phantom again. Wait for `Confirmed on Solana devnet`.

**Demo driver, after confirmation**

4. On the projected deal page, wait for `Septic reviewer · Signed`, `3 of 3 signed`, and then `Released · Payment released`. The newest timeline rows are labeled `Approval signed` and `Payment released` with `New` while fresh.
5. Click `View transaction` in the newest `Payment released` row. This opens the new release signature on Solana Explorer with `?cluster=devnet`.

**On screen**

- Before the taps: `10 test USDC · Funded`, two signed reviewers, septic waiting, on the phone card and the projected deal page
- Phone, after each tap: `Sent. Waiting for confirmation on Solana devnet…`, then `Confirmed on Solana devnet`, with the signature and `View on Solana Explorer`
- After Stream delivery and polling: `10 test USDC · Released`, `Payment released`, and `Every required reviewer signed, and the escrow paid 10 test USDC to the bound seller.`
- New timeline rows for the septic approval and payment, each marked `Confirmed on Solana devnet` and linked to Explorer

**Presenter — say exactly these three lines**

> “10 test USDC is funded, title and survey are signed, and septic is the one remaining reviewer—and this phone holds the staged septic reviewer's wallet.”

> “I'm signing that last approval and submitting the release from the phone now. GroundTruth never signs for a reviewer; QuickNode carries the confirmed program events into the API, and the deal page checks every two seconds.”

> “Now all three reviews are signed and exactly 10 test USDC went to the bound seller—the destination and amount were fixed before funding, and this Explorer receipt is independently verifiable.”

If the fallback runs, say the second line as: “Our driver is sending that last reviewer signature and the release from the laptop now; QuickNode carries the confirmed program events into the API, and the deal page checks every two seconds.”

**Fallbacks**

- Phantom or `/review` will not load, connect, or sign, or a tap shows `Not completed.`: the presenter gives the two-finger signal. The driver switches the projector to the terminal, runs `pnpm --filter @groundtruth/escrow demo:deals stage-finish` once, and switches back to the live-deal tab. It reads on-chain state and skips any step the phone already confirmed. It prints an `ok` line and a devnet signature for each step it sends: `ok sign_approval (septic)`, then `ok release released`.
- Approval confirmed on the phone but the release did not: same command. It skips the confirmed septic approval and sends only the release.
- `stage-finish` fails before its `ok` line: read the error. If it is a transient RPC or rate-limit error, rerun the same command once. For any other error, do not improvise with wallet files.
- Deal page does not update within 10 seconds: refresh it once. If it still does not update, open the release signature from the phone's `View on Solana Explorer` link or the terminal output, at `https://explorer.solana.com/tx/<release-signature>?cluster=devnet`. Do not claim a QuickNode delivery unless the timeline actually updates.
- Stream, API, phone, or live deal is unavailable: switch to <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released>, which shows a **prior** released deal for **25 test USDC**, then open its [preserved release transaction](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet). Say, “This is our preserved Nov 18 run, not the live 10-USDC stage deal.”
- Explorer slow: keep the product timeline on screen and point to the full release signature. If `stage-finish` ran, it also saved the result under `escrow/demo-results/devnet-stage-live-v1.{json,md}`.

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

Do **not** consume the live deal in the short version: no phone taps on `staged-devnet-deal-live` and no `stage-finish`. Use the preserved held and released receipts.

| Time | Owner | URL and exact actions | What is on screen | Spoken line |
| --- | --- | --- | --- | --- |
| 0:00–0:15 | Driver: homepage, no clicks. Presenter speaks. | <https://groundtruth-lac.vercel.app> | Headline, search, public records, reviewer signatures, Solana escrow | “A first-time land buyer needs to know whether they can use the lot and whether the seller can be paid. GroundTruth makes the evidence and next professional clear before money moves.” |
| 0:15–0:40 | Driver: click `Parcel ID or address`, type `230-000918`, click `Find parcel`, click the result, skip the transition if needed, click `Road access`. | <https://groundtruth-lac.vercel.app/search?q=230-000918> → <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918> | Real boundary; `Road access · Needs review`; county sources and limitation | “No mapped right-of-way touches this real Franklin County lot and the road is just over 100 metres away. GIS cannot prove legal access, so title review owns the next step.” |
| 0:40–1:10 | Driver: switch to held deal, scroll to `Release rejected`, click `View transaction`. Presenter speaks. | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal> → [DealHeld transaction](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet) | Title hold; rejected release; `Blocked · no money moved`; later refund preserved in history | “A title reviewer—not the callback agent—placed a seller-identity hold. Solana rejected the payout with `DealHeld`, and the buyer later recovered the full 25 test USDC.” |
| 1:10–1:35 | Driver: switch to preserved released deal, click the newest `Payment released` row's `View transaction`. Presenter speaks. | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released> → [release transaction](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet) | `25 test USDC · Released`; all three reviewers signed; payment receipt | “In the independent cleared deal, all three reviewers signed and the program paid exactly 25 test USDC to the bound seller.” |
| 1:35–2:00 | Driver: leave Explorer open. Presenter closes. | Preserved release on Solana Explorer | Independently verifiable receipt | “The product is Consumer because it starts with the buyer and the parcel. Solana makes the professional decisions obeyable by the money, and an Ohio title or closing partner is the path to a real pilot.” |

The ElevenLabs audio gate has passed: place a five-second excerpt of the recorded clip immediately before the held-deal line and shorten the closing by five seconds. If it will not play, point to the held deal's `Evidence received` row instead.
