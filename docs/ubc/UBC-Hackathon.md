# UBC 2026 Hackathon · GroundTruth

> **TL;DR**
> - **Goal:** win UBC with a working land-buying product. A first-time buyer discovers parcels across Ohio counties, understands a parcel's biggest open question, and watches their money stay in escrow when the seller's authority is disputed.
> - **Entry:** **Consumer Applications** as the main track, **Best Use of Solana** as the chain award, and the **QuickNode Streams** and **ElevenLabs** bounties only after their integrations meet the published and internal acceptance checks. Overall consideration is automatic.
> - **Deadline:** **Fri Nov 20, 1:00 p.m. ET / noon CT** on Devpost. Team target **11:00 a.m. ET / 10:00 a.m. CT**. Finals in person at UT Austin, Nov 21.
> - **Scope rule:** if a task does not improve parcel discovery, clarify the buyer's next action, prove an escrow outcome, or satisfy a submission requirement, it waits until the core demo runs.

Event info checked Nov 12, 2026. Milestones and timings are team plans.

## Dates and rules

| Date | Organizer schedule | What we do |
| --- | --- | --- |
| Thu, Nov 12 | Kickoff **7:00 p.m. ET / 6:00 p.m. CT**; hacking begins | Plan, assign owners, start building |
| Mon–Thu, Nov 16–19 | Sponsor workshops and office hours | Bring a specific question plus the current build |
| Fri, Nov 20 | Devpost submission by **1:00 p.m. ET / noon CT** | Submit early; save the confirmation |
| Fri night, Nov 20 | Finalist notice targeted by **11:59 p.m. CT** (**12:59 a.m. ET Saturday**) | Stage demo and presenter ready |
| Sat, Nov 21 | Finals at UT Austin: **5 minutes to present + 2 minutes Q&A** | Confirm stage call time and attendance with UBC |

**Operational start rule:** build from the organizer's explicit Nov 12, 6:00 p.m. CT kickoff. The UBC page and Devpost overview both say hacking starts then; the rules page also says work created before Nov 13 is excluded. Preserve commit timestamps, do not import pre-event application code, and ask the organizer to reconcile the wording without stopping the build. AI assistance is allowed with the students as primary creators; teams have one to four people; prize eligibility requires in-person presence for final presentations. [Organizer guide][guide] · [Devpost overview][devpost] · [Devpost rules][rules] · [Workshops][workshops] · [Organizer Telegram][telegram]

## What we're entering

The event advertises **$22,000+** in awards. One main track, at most one chain award; eligible bounties stack with each other, the track, the chain award, and overall placement. Pick categories and prize opt-ins on the submission form. [UBC prize and track page][ubc] · [Organizer guide][guide]

| Entry | Award | What GroundTruth shows |
| --- | --- | --- |
| **Consumer Applications** · **selected main track** | **$2,000** track winner | Lead with an everyday buyer journey: discovery, understandable evidence, and a closing where the chain is powerful but quiet. |
| **Best Use of Solana** | **$1,500** within the selected track | Devnet qualifies. Program enforces hold, required signers, bound payout. README gives program ID and Solana functionality. |
| **QuickNode Streams** | **$500** | Filtered Stream is the core source of the live closing timeline; a second-device signer changes the buyer's view. Document network, dataset, filter, destination, why it matters. |
| **ElevenLabs** | **3 months of Scale per winning team member** | Owner callback (consenting teammate) in the disputed closing; result goes to the reviewer, who can hold. Video needs audible footage. README names the product and role. |
| **Official UBC Winner** | **$2,500 / $1,000 / $500**; first also gets **3 months of ElevenLabs Pro per member** | Automatic. Make the story and both escrow outcomes obvious in the video. |

**Why Consumer is final:** UBC defines the track as everyday apps where crypto is invisible and the experience is seamless. A buyer begins with a parcel and a practical question, not a financial primitive. The custom escrow remains the technical depth for the Solana award. DeFi competition size is unknown and irrelevant; choosing a weaker product framing to guess at a smaller field would make the pitch worse.

Target awards could stack to **$6,500 cash** at first overall, plus perks (a possible team total). Working submissions may get participation perks at judges' discretion (QuickNode and X Premium are capped). Other categories: Best Use of Arc, Gemini Prediction Markets, Grok Bot. Using Grok for research, writing, or code review doesn't by itself meet the Grok Bot bounty. [UBC prize page][ubc] · [Devpost][devpost] · [Organizer guide][guide]

## Judges and rubric

Devpost lists judging teams from **Solana, Circle, ElevenLabs, Gemini, QuickNode, and Cursor** (team names, not a roster); Evan Solomon and Nathan Liow host kickoff. UBC picks track and overall winners, Solana its chain award, and each sponsor its bounty with a UBC representative. At kickoff, Circle's Yi Jing asked for complete, substantive workflows that solve real problems (sponsor feedback, not rubric). [Devpost judges and rubric][devpost] · [Kickoff event][kickoff] · [Organizer guide][guide]

Five published criteria, no weights:

- **Technical execution:** real devnet vault balance, a program-rejected release, a confirmed payout after sign-off, explorer links.
- **Product and UX:** a judge opens a parcel, gets the biggest open item, says where the deposit is and who acts next.
- **Innovation:** a real-world diligence issue becomes an enforceable payment decision, on screen.
- **Impact and potential:** first-time Ohio vacant-land buyers; coverage vs. depth; a title-partner pilot path.
- **Demo:** short, reproducible; balance and hold reason readable across the room.

## Win strategy

One complete story must score in all five criteria:

1. **Product & UX:** a first-time buyer finds a real lot and understands the most important unresolved question without knowing GIS or crypto.
2. **Technical execution:** the same lot has a deal-scoped test-USDC vault; a hold rejects release and a cleared deal pays the bound seller exactly once.
3. **Innovation:** evidence and professional decisions are not a PDF at the edge of the transaction; they become enforceable payment conditions.
4. **Impact:** statewide discovery shows reach, one deep report shows honesty, and a title/closing partner is the credible pilot customer.
5. **Demo:** the judge always knows where the money is, why it can or cannot move, and who acts next.

Depth beats a checklist. One OGRIP pipeline, one golden report, one program, two immutable deals, one live timeline, and one real staged call are enough. More states, more report categories, native mobile, and generalized AI agents are not winning scope until this works.

**Finalists:** up to 13 teams: three contender slots per track (track winner, Solana, Arc), three overall contenders, and the top Gemini bounty team. QuickNode and ElevenLabs add award paths but no finalist slot. **The product and the Solana proof have to earn the stage.** [Devpost finalist breakdown][devpost] · [Organizer guide][guide]

**Precedents:**

- **SolMail**, 2025 MBC Solana first place (reported by team member Rachel Turney): conditional payments on email replies. A familiar action makes conditions intuitive; put ours next to the deposit. [Award account][solmail-award] · [Project account][solmail-project]
- **HyperSphere**, 2025 MBC Circle bounty first place (reported by the builders): USDC NFC tap-to-pay. Make the sponsor visible in the action. [Builder recap][hypersphere]
- **Jaeger**, 2025 MBC Polymarket bounty first place (reported by Boiler Blockchain): markets surfaced on the page you're reading. Answer in context. [Award recap][boiler] · [Project walkthrough][jaeger]
- **VeriNest**, adjacent HackQuest project: property verification and escrow for African real estate; its write-up reports incomplete escrow deployment. Land escrow isn't new; our edge is sourced evidence for a first-time buyer plus both on-chain outcomes. [VeriNest project write-up][verinest]

## Milestones

Owners per the [README roles table](../../README.md#team-and-roles). Every checkpoint ends with something a teammate can open, run, or verify.

| When | Checkpoint |
| --- | --- |
| **Thu Nov 12 · Plan** | Demo story, owners, Ohio data sources, minimum report and closing states ([DataContract](../architecture/DataContract.md)) |
| **Fri Nov 13 · Parallel build** | [Decisions](../architecture/Decisions.md) locked, scaffold up; screens on shared fixtures; one dated, cited Ohio finding; escrow runs locally; devnet, Streams, voice access confirmed |
| **Nov 14–15 · Chain + search** | Multi-county parcels mapped; devnet deposit works, held releases fail, cleared deal pays; tx links and balances saved |
| **Sun Nov 16 · First full pass** | Deployed flow: search, sourced report, both closings; reset procedure |
| **Mon Nov 17 · Sponsor proof** | Real ElevenLabs call reaches a reviewer; a second-device approval lands via a filtered Stream |
| **Tue Nov 18 · Rehearse** | A non-builder runs the demo and explains the hold; Consumer pitch and Q&A answers locked |
| **Wed Nov 19 · Freeze** | 2–3 min video plays with audio signed out; Devpost drafted; stage run rehearsed; labeled backup of the real run |
| **Fri Nov 20 · Submit** | Internal submit by **11:00 a.m. ET / 10:00 a.m. CT**; verify links, all four members, prize selections, confirmation |

**If time gets tight:** keep broad Ohio discovery and both escrow outcomes; cut local evidence integrations. Extra states only if the same pipeline supports them. If telephony is unstable, a recorded run of the real ElevenLabs integration protects the stage demo. Enter a bounty only when its requirements are met.

## Demo and submission

**One-sentence pitch:** GroundTruth helps a first-time land buyer understand a parcel before paying and uses Solana escrow to keep test USDC from moving until the right staged professionals sign off.

**Stage timing (5:00):** **0:00–0:30** the buyer and “Can I build here?” · **0:30–1:15** real multi-county search and one consequential sourced finding · **1:15–2:45** consenting-owner callback, reviewer hold, release fails · **2:45–4:00** final approval via Streams, exact bound payout · **4:00–4:40** why Consumer, why Solana, title-company pilot · **20 seconds** latency buffer. Cut a shorter screening version; keep transaction links ready for Q&A; show the phone-sized route only if it is reliable. Payment claims use real on-chain state; signer wallets stand in for staged professionals.

**Before submitting**

- [ ] Name, description, all members, technologies, one main track, Solana, qualifying bounties and opt-ins.
- [ ] Written answers: build, problem, how it works, what's different, what's next.
- [ ] Public repo with setup instructions; README with architecture, program IDs, network, sponsor configuration.
- [ ] Working demo plus a **2–3 minute** accessible YouTube or Google Drive video, with audible ElevenLabs output.
- [ ] Eligibility and attendance verified; demo, repo, video open signed-out.

[Organizer submission requirements][guide] · [Devpost submission and rubric][devpost]

[ubc]: https://www.universityblockchain.org/programs/hackathon
[guide]: https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?usp=sharing
[devpost]: https://ubc-hackathon-2026.devpost.com/
[rules]: https://ubc-hackathon-2026.devpost.com/rules
[workshops]: https://docs.google.com/document/d/1eI8S0gBu6xI36DFqgqGZlO1qX6YYzFTEXBx9L5ve_zA/edit?usp=sharing
[telegram]: https://t.me/+Q0hy2P7nbIk2YWIx
[kickoff]: https://luma.com/plb6gvf0
[solmail-award]: https://www.linkedin.com/in/rachelhturney
[solmail-project]: https://hrishabhayush.com/
[hypersphere]: https://www.linkedin.com/posts/adi-chaudharyy_i-just-competed-at-the-midwest-blockchain-activity-7404305679253188608-d2Yj
[boiler]: https://www.linkedin.com/posts/boilerblockchain_recap-checklist-midwest-blockchain-conference-activity-7404952965884751875-1CkJ
[jaeger]: https://jkok.dev/projects/jaeger
[verinest]: https://www.hackquest.io/ja/projects/Verinest
