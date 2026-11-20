# Submission video script

**Length:** about 2:56 with shot 5b, 3:00 hard limit. Narration is about 425 words. If the cut runs long, trim shot 5 to the `Flood` drawer only.
**Story:** the [five-minute stage run](../../ubc/UBC-Hackathon.md#demo-and-submission), compressed: find the lot, see the open question, a held payout blocked on-chain, a released payout with its Explorer link.
**Status on Nov 18, 10:50 p.m. ET (checked on the live site, signed out):** shots 1 to 6 and 8 to 13 can be recorded today. The held and released deal pages are live with the hold, the `DealHeld` rejection, the refund, the three approvals, the payout, and the `Evidence received` row, each with its Explorer link. Shot 7 needs the audio clip of the real staged call (`conv_9801m7rbaxvye0yrq4jmyzfyq6xz`); the call itself is recorded. Shot 11 must not claim QuickNode or a live phone update unless it is filmed on a deal the Stream delivered (see the shot). See [Readiness.md](Readiness.md).
**Ask this lot, Nov 19, 9:44 p.m. ET:** typed questions work live. `Does this lot have road access?` on the golden parcel returned `covered: true` with three county sources. Voice is broken live: a recorded question to `/questions/voice` returns `502 Voice transcription is unavailable` because ElevenLabs refuses the speech-to-text call with the Railway key. Film shot 5b **typed** until a voice re-test returns `200` with a transcript and audio. Then the voice alternate below can replace it.

## Tags

| Tag | Meaning |
| --- | --- |
| `[READY]` | Works on <https://groundtruth-lac.vercel.app> today. |
| `[NEEDS DEVNET RUN]` | Needs the two demo deals run on devnet, with their saved signatures and balances. The run happened on Nov 18; the tag stays so each shot is checked against the real links. |
| `[NEEDS ELEVENLABS]` | Needs the audio of the real staged ElevenLabs call. The call happened on Nov 18 (`conv_9801m7rbaxvye0yrq4jmyzfyq6xz`) and is on the held deal's timeline. |
| `[NEEDS VOICE FIX]` | Needs the parcel page microphone working live. A recorded question on the golden parcel must return `200` with a transcript and audio. |
| `[NEEDS DEAL PAGE]` | Needs a deal or timeline page on the website. Until it exists, film the fallback in the same row. |

Do not film a mock-up, a simulation, or an edited database row for any tagged shot. If a tagged shot is still not real at recording time, cut it and cut its narration.

## Before recording

- Record at 1920 × 1080, browser zoom 100%, signed out, in a private window with no extensions or bookmarks bar.
- Preload the golden parcel once so the opening transition is short: <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>. If it runs long while recording, press any key to skip it.
- Open every Explorer link in its own tab beforehand, with the cluster set to devnet.
- Keep this caption on screen for all of shots 7 to 12: **Staged roles · test USDC · Solana devnet**.
- Add captions for all narration and for the call audio.
- Record the narration separately and lay it over the screen capture. Keep the ElevenLabs call audio at full volume with no narration over it.
- Shot 5b, typed: type the question by hand (it is not one of the suggestion chips) and do not click **Mic**. Shot 5b, voice: the screen capture must record both the microphone and system audio.

## Shot list

| # | Time | Status | On screen | Narration |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:12 | `[READY]` | Homepage hero: "Know the land before the money moves." Slow push in on the search box. | "You find a vacant lot you can finally afford. Before you send a deposit, you need two answers. Can I build here? And does the person asking for my money own it?" |
| 2 | 0:12–0:22 | `[READY]` | Type `230-000918`, click **Find parcel**. One result: `230-000918 · Franklin County · Matched parcel ID`. Click it. | "GroundTruth starts with the land. This is a real three-acre lot in Franklin County, Ohio, found by the parcel ID the state publishes." |
| 3 | 0:22–0:30 | `[READY]` | Parcel page: the 3D land block with the gold boundary, then the Ledger. `Road access` is marked **Needs review** and **Biggest open question**. | "Beside the published boundary, every check has a status, a source, and a person who acts next." |
| 4 | 0:30–0:50 | `[READY]` | Click `Road access`. Hold on **What we know**, then **What it does not establish**, then the three county sources and their retrieval dates. | "This is the fact that changes the plan. No mapped county right-of-way touches the lot, and the nearest road is just over a hundred metres away. A map cannot show a recorded easement, so a title reviewer has to resolve legal access. These are the county records behind that flag." |
| 5 | 0:50–0:58 | `[READY]` | Close the drawer. Open `Can you build here?` for two seconds, then `Flood` for two seconds. | "Zoning is promising, not a green light. FEMA maps minimal flood hazard, not zero risk." |
| 5b | 0:58–1:14 | `[READY]` | Scroll to **Ask this lot**. Click the question box, type `Does this lot have road access?`, click **Ask**. Hold on the answer: the **From this report** label, the first lines (no road right-of-way touches the parcel; Seaman Rd about 107 m away; the limitation; title review next), then the three sources under **Road and legal access**: Franklin County right-of-way layer, Franklin County Engineer road sections, and the 2026 Zoning Resolution §302.042 and §302.0391. | "You can also just ask the lot. The answer uses only this report: no mapped right-of-way touches the parcel, and title review is the next step. Every line names the county record behind it." |
| 6 | 1:14–1:26 | `[READY]` | Cut to the homepage "Why seller verification comes first" block. Highlight **59%**, then **28%**. Keep the source links in frame. | "The second question is harder. In ALTA's 2026 survey of 245 title professionals, 59 percent reported at least one seller-impersonation attempt in 2025. In its 2024 survey, covering 2023, that was 28 percent." |
| 7 | 1:26–1:44 | `[NEEDS ELEVENLABS]` | A phone on speaker beside the deal screen. On-screen label: **Staged call · consenting teammate plays the owner**. Let the agent's question and the answer play in full. | "So before this deal closes, an ElevenLabs voice agent calls the owner on record." Then the call audio only: the agent asks whether they are selling the lot, and the owner answers, "I'm not selling." |
| 8 | 1:44–1:52 | `[READY]` | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal>: the `Evidence received` row, "Owner callback: the person reached as the owner on record said they are not selling this lot", marked `Off-chain record · not a chain event`. It sits above the refund because the call came after it; do not imply it came first. | "The call is evidence. It approves nothing. A human title reviewer reads it." |
| 9 | 1:52–2:06 | `[READY]` | The same deal page: the `Hold on this deal · Seller identity disputed` card and the `Hold placed` row, then the `Release rejected · Blocked · no money moved` row ending `DealHeld (6019)`. Click its `View transaction` and hold on the failed transaction on Solana Explorer. | "The reviewer signs a hold. Now watch someone try to release the money anyway. The Solana program rejects it." |
| 10 | 2:06–2:16 | `[READY]` | Balance table from `escrow/demo-results/` or Devpost.md: buyer, vault, and seller before and after the rejected release, all unchanged. Then the Explorer page for the refund. | "Buyer, vault, and seller are unchanged. Twenty-five test dollars stayed in escrow, and the buyer took a refund." |
| 11 | 2:16–2:32 | `[READY]` | <https://groundtruth-lac.vercel.app/deals/staged-devnet-deal-released>: `3 of 3 signed` and the three `Approval signed` rows with their Explorer links. These rows were backfilled with `replay:devnet`, not delivered by the Stream. | "A second deal, with nothing in dispute. Title, survey, and septic each sign." Add "A QuickNode Stream carries every confirmed signature to the buyer's phone" **only** if this shot is filmed on a deal whose rows the Stream delivered, with the phone visibly updating. |
| 12 | 2:32–2:46 | `[READY]` | The release transaction on Solana Explorer: 25 USDC from the vault to the seller's token account. Then the balance table: seller up by exactly 25, vault closed. | "With every approval in and no hold, the program pays the seller the exact amount, once. Both outcomes are on Solana Explorer for anyone to check." |
| 13 | 2:46–2:56 | `[READY]` | End card: **GroundTruth** · groundtruth-lac.vercel.app · the repo URL · the program ID · **Consumer Applications · Best Use of Solana** · "Staged roles and test USDC on Solana devnet. Not legal or title advice." | "GroundTruth does not replace the professionals. It makes their evidence and their decisions understandable to the buyer, and it makes the payment obey them." |

### Shot 5b alternate: ask by voice `[NEEDS VOICE FIX]`

Use this in place of the typed shot 5b only after the voice re-test passes. It takes the same 0:58–1:14 slot, so no other timing changes.

| Time | On screen | Audio |
| --- | --- | --- |
| 0:58–1:00 | Scroll to **Ask this lot**. | Narration: "Or just ask it out loud." |
| 1:00–1:04 | Click **Mic**, ask the question aloud, click **Stop**. | Live mic: "Does this lot have road access?" No narration. |
| 1:04–1:06 | **Checking report…**, then the transcript appears as the question with the answer, its three **Road and legal access** sources, and an audio player. Trim the wait in the edit, but never claim the answer is instant. | Silence. |
| 1:06–1:12 | Click play on the audio player. On-screen label: **Spoken answer · read from this report**. | The spoken answer at full volume with no narration over it. Use only its first two sentences ("No road right-of-way touches this parcel in Franklin County's right-of-way layer. The nearest mapped road, Seaman Rd, is about 107 m away…"), then fade out. |
| 1:12–1:14 | Hold on the sources. | Narration: "ElevenLabs hears the question and reads back only what this report shows." |

- The spoken answer uses the same agent voice as the owner callback in shot 7. The **Spoken answer** label keeps viewers from mistaking it for the call.
- Caption the spoken question and the spoken answer excerpt.

## If something is not ready by Thursday night

| Missing | What to do |
| --- | --- |
| The ElevenLabs call | Cut shots 7 and 8. In shot 9, say "A title reviewer disputes the seller's authority and signs a hold." Do not select the ElevenLabs bounty. |
| The deal page | Live since Nov 18 for the held and released deals. If it is down while recording, film shots 9 to 12 from Solana Explorer and the balance tables in Devpost.md. These shots are the Solana proof; do not cut them. |
| Ask this lot by voice | Film shot 5b typed, as written. It needs no voice key and makes no ElevenLabs claim. Owner-callback shots 7 and 8 do not depend on it. |
| The QuickNode second-device check | Keep shot 11's narration without QuickNode, and do not select the QuickNode bounty. |

## Claim guardrails

- Say "no mapped right-of-way touches the lot". Never say "landlocked" or "no access".
- Say "minimal mapped flood hazard". Never say "safe from flooding".
- Give 59% and 28% with their years and the 245-respondent denominator, as in shot 6.
- Say "test USDC" or "test dollars" and "devnet" whenever money appears.
- The call is evidence for a reviewer. Never say the AI blocked, approved, or verified anything.
- An Ask this lot answer repeats the report's checks. Never say it confirms access or tells the buyer what to do. Say "the next step" and name who owns it.
- Never say GroundTruth verifies an owner, gives legal advice, or confirms that a lot is buildable.
- The held deal's demo run ended with a refund to the buyer, so its account now reads refunded and its vault is closed. Film the rejected release transaction itself for shot 9, and if the final state is on screen, say so.

## After recording

- [ ] Runs between 2:00 and 3:00.
- [ ] The ElevenLabs audio is audible without headphones, if shots 7 and 8 are in.
- [ ] If the voice alternate of shot 5b is in, the spoken question and spoken answer are audible and captioned.
- [ ] Every Explorer page on screen shows the devnet cluster and a signature that matches `escrow/demo-results/`.
- [ ] Uploaded to YouTube as Public or Unlisted, and it plays signed out in a private window.
- [ ] The link is in Devpost and in the root README.
