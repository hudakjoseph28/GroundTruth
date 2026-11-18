# Submission video script

**Length:** 2:40 target, 3:00 hard limit. Narration is about 390 words.
**Story:** the [five-minute stage run](../../ubc/UBC-Hackathon.md#demo-and-submission), compressed: find the lot, see the open question, a held payout blocked on-chain, a released payout with its Explorer link.
**Status on Nov 18:** shots 1 to 6 can be recorded today from the live site. Shots 7 to 13 cannot be recorded yet. See [Readiness.md](Readiness.md).

## Tags

| Tag | Meaning |
| --- | --- |
| `[READY]` | Works on <https://groundtruth-lac.vercel.app> today. |
| `[NEEDS DEVNET RUN]` | Needs the two demo deals run on devnet, with their saved signatures and balances. |
| `[NEEDS ELEVENLABS]` | Needs the real staged ElevenLabs call, recorded with audio. |
| `[NEEDS DEAL PAGE]` | Needs a deal or timeline page on the website. Until it exists, film the fallback in the same row. |

Do not film a mock-up, a simulation, or an edited database row for any tagged shot. If a tagged shot is still not real at recording time, cut it and cut its narration.

## Before recording

- Record at 1920 × 1080, browser zoom 100%, signed out, in a private window with no extensions or bookmarks bar.
- Preload the golden parcel once so the opening transition is short: <https://groundtruth-lac.vercel.app/parcels/ohio%3A39049%3A230-000918>. If it runs long while recording, press any key to skip it.
- Open every Explorer link in its own tab beforehand, with the cluster set to devnet.
- Keep this caption on screen for all of shots 7 to 12: **Staged roles · test USDC · Solana devnet**.
- Add captions for all narration and for the call audio.
- Record the narration separately and lay it over the screen capture. Keep the ElevenLabs call audio at full volume with no narration over it.

## Shot list

| # | Time | Status | On screen | Narration |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:12 | `[READY]` | Homepage hero: "Know the land before the money moves." Slow push in on the search box. | "You find a vacant lot you can finally afford. Before you send a deposit, you need two answers. Can I build here? And does the person asking for my money own it?" |
| 2 | 0:12–0:22 | `[READY]` | Type `230-000918`, click **Find parcel**. One result: `230-000918 · Franklin County · Matched parcel ID`. Click it. | "GroundTruth starts with the land. This is a real three-acre lot in Franklin County, Ohio, found by the parcel ID the state publishes." |
| 3 | 0:22–0:30 | `[READY]` | Parcel page: the 3D land block with the gold boundary, then the Ledger. `Road access` is marked **Needs review** and **Biggest open question**. | "Beside the published boundary, every check has a status, a source, and a person who acts next." |
| 4 | 0:30–0:50 | `[READY]` | Click `Road access`. Hold on **What we know**, then **What it does not establish**, then the three county sources and their retrieval dates. | "This is the fact that changes the plan. No mapped county right-of-way touches the lot, and the nearest road is just over a hundred metres away. A map cannot show a recorded easement, so a title reviewer has to resolve legal access. These are the county records behind that flag." |
| 5 | 0:50–0:58 | `[READY]` | Close the drawer. Open `Can you build here?` for two seconds, then `Flood` for two seconds. | "Zoning is promising, not a green light. FEMA maps minimal flood hazard, not zero risk." |
| 6 | 0:58–1:10 | `[READY]` | Cut to the homepage "Why seller verification comes first" block. Highlight **59%**, then **28%**. Keep the source links in frame. | "The second question is harder. In ALTA's 2026 survey of 245 title professionals, 59 percent reported at least one seller-impersonation attempt in 2025. In its 2024 survey, covering 2023, that was 28 percent." |
| 7 | 1:10–1:28 | `[NEEDS ELEVENLABS]` | A phone on speaker beside the deal screen. On-screen label: **Staged call · consenting teammate plays the owner**. Let the agent's question and the answer play in full. | "So before this deal closes, an ElevenLabs voice agent calls the owner on record." Then the call audio only: the agent asks whether they are selling the lot, and the owner answers, "I'm not selling." |
| 8 | 1:28–1:36 | `[NEEDS ELEVENLABS]` `[NEEDS DEAL PAGE]` | The deal timeline: a new row, "Owner callback: owner denies sale", marked as evidence for the title reviewer. Fallback: none. Cut this shot. | "The call is evidence. It approves nothing. A human title reviewer reads it." |
| 9 | 1:36–1:50 | `[NEEDS DEVNET RUN]` `[NEEDS DEAL PAGE]` | The title reviewer's hold appears on the held deal. Then a release is attempted and the row reads **Release rejected: DealHeld**. Fallback: the failed release transaction on Solana Explorer, with the `DealHeld` log line highlighted. | "The reviewer signs a hold. Now watch someone try to release the money anyway. The Solana program rejects it." |
| 10 | 1:50–2:00 | `[NEEDS DEVNET RUN]` | Balance table from `escrow/demo-results/`: buyer, vault, and seller before and after the rejected release, all unchanged. Then the Explorer link for that transaction. | "Buyer, vault, and seller are unchanged. Twenty-five test dollars are still in escrow, and the buyer can take a refund." |
| 11 | 2:00–2:16 | `[NEEDS DEVNET RUN]` `[NEEDS DEAL PAGE]` | Second deal on the same lot. Laptop and phone side by side. Title, survey, and septic approvals arrive one by one; the phone updates without a refresh. Fallback: the three approval transactions on Explorer, and do not mention the phone or QuickNode. | "A second deal, with nothing in dispute. Title, survey, and septic each sign. A QuickNode Stream carries every confirmed signature to the buyer's phone." |
| 12 | 2:16–2:30 | `[NEEDS DEVNET RUN]` | The release transaction on Solana Explorer: 25 USDC from the vault to the seller's token account. Then the balance table: seller up by exactly 25, vault closed. | "With every approval in and no hold, the program pays the seller the exact amount, once. Both outcomes are on Solana Explorer for anyone to check." |
| 13 | 2:30–2:40 | `[READY]` | End card: **GroundTruth** · groundtruth-lac.vercel.app · the repo URL · the program ID · **Consumer Applications · Best Use of Solana** · "Staged roles and test USDC on Solana devnet. Not legal or title advice." | "GroundTruth does not replace the professionals. It makes their evidence and their decisions understandable to the buyer, and it makes the payment obey them." |

## If something is not ready by Thursday night

| Missing | What to do |
| --- | --- |
| The ElevenLabs call | Cut shots 7 and 8. In shot 9, say "A title reviewer disputes the seller's authority and signs a hold." Do not select the ElevenLabs bounty. |
| The deal page | Use the Explorer fallbacks in shots 9 and 11. Do not select the QuickNode bounty unless a second device is shown updating from the Stream. |
| The devnet run | There is no submission video without it. Shots 9 to 12 are the Solana proof, and nothing stands in for them. |

## Claim guardrails

- Say "no mapped right-of-way touches the lot". Never say "landlocked" or "no access".
- Say "minimal mapped flood hazard". Never say "safe from flooding".
- Give 59% and 28% with their years and the 245-respondent denominator, as in shot 6.
- Say "test USDC" or "test dollars" and "devnet" whenever money appears.
- The call is evidence for a reviewer. Never say the AI blocked, approved, or verified anything.
- Never say GroundTruth verifies an owner, gives legal advice, or confirms that a lot is buildable.
- The held deal's demo run ends with a refund to the buyer. If the final state is on screen, say so.

## After recording

- [ ] Runs between 2:00 and 3:00.
- [ ] The ElevenLabs audio is audible without headphones, if shots 7 and 8 are in.
- [ ] Every Explorer page on screen shows the devnet cluster and a signature that matches `escrow/demo-results/`.
- [ ] Uploaded to YouTube as Public or Unlisted, and it plays signed out in a private window.
- [ ] The link is in Devpost and in the root README.
