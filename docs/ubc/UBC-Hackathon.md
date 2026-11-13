# UBC 2026 Hackathon | GroundTruth

**Use this file for competition decisions.** It records what the event requires, what the judges need to see, and what four student builders can prove in a week. Use the [problem brief](../context/Problem.md) for land-buying research and [Architecture](../architecture/Architecture.md) for implementation details. Event information checked November 12, 2026. Milestones and demo timings below are team proposals.

## Read this first

- **Goal:** Win UBC with a working land-buying product. Prove that a first-time buyer can discover parcels across counties, understand a parcel's biggest open question, and see their money stay in escrow when a seller's authority is disputed.
- **Entry:** Main track undecided between Consumer Applications and DeFi & Onchain Applications. Target Best Use of Solana and the QuickNode Streams and ElevenLabs bounties if the integrations meet their requirements. Overall consideration is automatic.
- **Deadline:** Friday, November 20 at **1:00 p.m. Eastern / noon Austin Central**. Team target is **11:00 a.m. Eastern / 10:00 a.m. Central**. Finals are in person at UT Austin on November 21.
- **Proof:** Search and map real parcels across Ohio counties. Use a strong source-backed report for the main walkthrough and two staged closings to show an on-chain rejection and a confirmed USDC payout after final approval. Use Solana Devnet and label test funds and staged roles.
- **Scope rule:** If a task does not improve the buyer's decision, prove an escrow outcome, or satisfy a submission requirement, put it after the core demo. A working report and a complete closing sequence come before extra integrations or features.

## Official dates and rules

| Date | Organizer schedule | Team implication |
| --- | --- | --- |
| Thu, Nov 12 | Kickoff at **7:00 p.m. ET / 6:00 p.m. CT**. The guide says hacking begins at kickoff. | Use the kickoff for planning and task boundaries. See the published start discrepancy below. |
| Mon–Thu, Nov 16–19 | Sponsor workshops and office hours. | Bring a specific eligibility or integration question and evidence of the current implementation. |
| Fri, Nov 20 | Submit on Devpost by **1:00 p.m. ET / noon CT**. | Send the complete entry early and save the confirmation. |
| Fri night, Nov 20 | Finalist notice targeted by **11:59 p.m. CT**, which is **12:59 a.m. ET Saturday**. | Have a stage demo and an in-person presenter ready before the notice. |
| Sat, Nov 21 | Finals and closing ceremony at UT Austin. Finalists get **5 minutes to present and 2 minutes for Q&A**. | Confirm the stage call time from the organizer's agenda and team attendance with UBC. |

**Published start discrepancy.** The organizer guide and Devpost overview say the build starts at the Nov 12 kickoff and explain that the Friday Devpost widget start is a platform limitation. The Devpost rules page lists that same kickoff time and also excludes work created before Nov 13. Plan around Nov 13 for submitted implementation and get organizer clarification before relying on work created Thursday night. The published rules require original work from the event, permit AI assistance with builders remaining the primary creators, and allow teams of one to four. The guide requires in-person team presence at the closing ceremony for prize eligibility. Confirm how this applies to individual teammates if attendance is split. [Organizer guide][guide] · [Devpost overview][devpost] · [Devpost rules][rules] · [Workshops][workshops] · [Organizer Telegram][telegram]

## What we are entering

The event advertises **$22,000+** across awards. Enter one main track and at most one chain award. Eligible bounties can stack with each other, the track, the chain award, and overall placement. Choose the matching categories and prize opt-ins on the submission form. [UBC prize and track page][ubc] · [Organizer guide][guide]

| Entry | Published award | What GroundTruth should show |
| --- | --- | --- |
| **Consumer Applications** · candidate | **$2,000** for the track winner | The guide requires a user-facing frontend and blockchain interaction. Lead with parcel discovery, understandable evidence, and a smooth closing experience. |
| **DeFi & Onchain Applications** · candidate | **$2,000** for the track winner | Lead with programmable USDC escrow as a payment rail. Show exactly what authorizes release, blocks payout, or permits refund. Document the economic design, risk assumptions, and program addresses as required by the guide. |
| **Best Use of Solana** | **$1,500** within the selected main track | Devnet qualifies. Show that the program enforces a hold, required signer approvals, and the agreed payout destination. Include the program ID and explain the Solana functionality in the README. |
| **QuickNode Streams** | **$500** | Use a filtered Stream as the core data source for the buyer's live closing timeline. Show a signer on a second device change the buyer's view. Document network, dataset, filter, destination, and why the Stream matters. |
| **ElevenLabs** | **3 months of Scale per winning team member** | Make the conversational owner callback part of the disputed closing. Use a consenting teammate and route the result to a reviewer, who can place the hold. The demo video needs audible integration footage. Name the ElevenLabs product and its role in the README. |
| **Official UBC Winner** | **$2,500 / $1,000 / $500** for first through third. First also gets **3 months of ElevenLabs Pro per member**. | Eligibility is automatic. Make the buyer story and both escrow outcomes obvious in the submission video. |

**Track decision:** Build the same core journey for both candidates. Once it runs end to end, compare the strongest evidence in each pitch. Consumer is strongest if buyers can quickly find, understand, and track a real parcel deal. DeFi is strongest if the payment rules and on-chain outcomes stand on their own as a convincing settlement workflow. Choose one before recording the submission. The relative competition in each track is still unknown.

Our target awards could stack to **$6,500 cash** at first overall, plus the listed sponsor perks. This is a possible team total. The working submission can also qualify for participation perks at the judges' discretion, with caps on QuickNode and X Premium. The other categories are Best Use of Arc, Gemini Prediction Markets, and Grok Bot. Using Grok for research, writing, or code review does not by itself meet the separate Grok Bot bounty requirements. [UBC prize page][ubc] · [Devpost][devpost] · [Organizer guide][guide]

## Judges, rubric, and prior winners

Devpost lists teams from **Solana, Circle, ElevenLabs, Gemini, QuickNode, and Cursor**. It gives team names in place of a full individual panel roster. Evan Solomon and Nathan Liow are listed as kickoff hosts. The UBC team selects the track and overall winners. Solana selects its chain award, and each bounty is judged by its sponsor with a UBC representative. In the kickoff, Circle's Yi Jing described wanting complete, substantive workflows that solve real problems. Treat that as sponsor feedback. The five criteria below are the published event rubric, and the organizers give no numerical weights. [Devpost judges and rubric][devpost] · [Kickoff event][kickoff] · [Organizer guide][guide]

| Published criterion | Evidence for the judge |
| --- | --- |
| Technical execution | A real Devnet vault balance, a release rejected by the program, and a confirmed payout after authorized sign-off. A transaction or explorer link for each case. |
| Product and UX | A judge opens a parcel, understands the biggest unresolved item, and can explain where the deposit is and who acts next. |
| Innovation | The same buyer journey carries a real-world diligence issue into an enforceable payment decision. Show that connection on screen. |
| Impact and potential | Start with first-time vacant-land buyers across Ohio. Show where parcel discovery works and where deeper review is available. Explain how a title or closing partner could validate the workflow in a pilot. |
| Demo | A short, reproducible walkthrough. Make the balance and the reason for the hold readable from across the room. |

**Finalist selection matters.** The guide allows up to 13 teams, drawn from three contender slots per track (track winner, Solana, Arc), three overall contenders, and the top Gemini bounty team. A strong QuickNode or ElevenLabs integration adds an award path. The published finalist breakdown lists no separate slot for either. The product and the Solana proof need to earn the stage. [Devpost finalist breakdown][devpost] · [Organizer guide][guide]

| Precedent | What to take from it |
| --- | --- |
| **SolMail · 2025 MBC Solana first place**, reported by team member Rachel Turney. The product attached conditional Solana payments to email replies. | A familiar action can make conditional payments intuitive. In GroundTruth, make the condition visible where the buyer expects to see it, next to the deposit. [Award account][solmail-award] · [Project account][solmail-project] |
| **HyperSphere · 2025 MBC Circle bounty first place**, reported by the builders. The demo used USDC for NFC tap-to-pay. | Make the sponsor's contribution visible through the action. The judge should see a remote approval land in GroundTruth and know why Streams matters. [Builder recap][hypersphere] |
| **Jaeger · 2025 MBC Polymarket bounty first place**, reported by Boiler Blockchain. The browser extension surfaced prediction markets relevant to the page someone was already reading. | Give the user a useful answer in context. GroundTruth should reveal the parcel's biggest open question on the first useful screen. [Award recap][boiler] · [Project walkthrough][jaeger] |
| **VeriNest · adjacent HackQuest project.** Its project write-up describes property verification and escrow for African real estate and reports that the escrow deployment was incomplete during its hackathon. | Treat on-chain land verification and escrow as existing ideas. Show GroundTruth's specific distinction: a first-time buyer gets source-backed parcel evidence, then sees a disputed payout rejected and a cleared payout settle. [VeriNest project write-up][verinest] |

## Proposed team milestones

Assign one owner each to **buyer UI**, **parcel evidence**, **Solana escrow**, and **voice/Streams and deployment**. The owners share the data shapes and two staged fixtures. Each checkpoint ends with something a teammate can open, run, or verify.

| When | Show at checkpoint |
| --- | --- |
| **Nov 12 evening · Planning** | Pick the demo story, assign four owners, identify Ohio parcel data and local sources, and write down the minimum report and closing states. |
| **Nov 13 · Work in parallel** | Parcel and Closing screens run with shared fixtures. Evidence work checks data access across Ohio counties and returns a dated, cited finding. The chain owner runs a basic escrow operation locally. The integration owner confirms Devnet, Streams and voice access. |
| **Nov 14–15 · Prove the chain and search** | Search and map parcels in multiple counties. A Devnet deposit succeeds, unauthorized or held releases fail, and a cleared deal pays the agreed seller. Save transaction links and verify the held and released balances. |
| **Nov 16 · First complete pass** | A teammate can open the deployed flow, search across counties, read a source-backed parcel report, and finish both staged closing paths. Establish a reset or fresh-deal procedure. |
| **Nov 17 · Prove sponsor work** | A real ElevenLabs call with demo audio reaches a reviewer as evidence. A real signed approval on a second device arrives in the buyer timeline through a filtered QuickNode Stream. |
| **Nov 18 · Rehearse on a clean session** | A teammate who did not build the screen can run the demo and explain the hold. Test the public entry path and evidence links. Compare the Consumer and DeFi pitches and choose the track for submission. |
| **Nov 19 · Package and freeze** | Record the 2–3 minute video, confirm it plays with audio while signed out, prepare Devpost, rehearse the five-minute stage version, and capture a labeled backup of the real run. |
| **Nov 20 · Submit** | Submit by **11:00 a.m. ET / 10:00 a.m. CT** internally. Verify the repo, app and video links, all four team members, prize selections, and the submission confirmation. |

Target statewide parcel discovery through Ohio's standardized parcel source. Validate actual coverage across counties and deepen reports where local records support them. If time gets tight, keep broad discovery and both escrow outcomes, then narrow the number of local evidence integrations. Additional states are a stretch if the same pipeline can support them reliably. Use staged identities for the closings. If voice telephony is unstable, a recorded run of the actual ElevenLabs integration can protect the stage demo. Enter each bounty when its published requirements are met.

## Demo and submission

**Stage timing.** **0:00–0:30** introduce the first-time buyer. **0:30–1:15** show search across counties and open a parcel with one consequential finding and its source. **1:15–2:45** play the owner callback, show the reviewer hold, and submit the release that fails. **2:45–4:00** switch to the cleared case, show the final approval arrive through Streams, and show the payout. **4:00–4:40** explain the professional review and county deed handoff, then show the path to a title-company pilot. Leave **20 seconds** for latency. Capture a shorter cut for initial screening and keep transaction links handy for Q&A. If the phone handoff works reliably, use it to show the same closing update on both screens.

Use actual on-chain state for payment claims. A callback can surface an identity dispute, and the assigned reviewer decides whether to hold the closing. A signer wallet represents a staged professional in the demo. The program records deal approvals and moves Devnet USDC under the agreed rules. The county deed process remains separate.

**Before submitting**

- [ ] Project name, description, all team members, technologies, one selected main track, Solana, and qualifying bounty selections and opt-ins.
- [ ] Written answers covering the build, problem, how it works, what is different, and what comes next.
- [ ] Public GitHub repository with source and setup instructions, plus a README with architecture, Solana program IDs, network, and sponsor configuration.
- [ ] Working app or demo and a **2–3 minute** accessible YouTube or Google Drive video showing the product in action. Include the ElevenLabs integration with audible output.
- [ ] Verify eligibility and attendee coverage, and check that the demo, repo, and video open for a signed-out judge.

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
