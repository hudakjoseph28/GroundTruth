# Phase 4 · Pitch and submission

**Owner:** whole team. Name one presenter and one demo driver by Nov 18; everyone else owns Q&A proof and reset.

**Outcome:** a complete Consumer Applications submission and a reproducible five-minute presentation make one claim: GroundTruth helps a first-time land buyer understand a parcel before paying, then uses Solana to enforce the staged professionals' payment conditions.

**Status and video:** [Readiness punch list](Readiness.md) · [submission video script](VideoScript.md) · [Devpost draft](Devpost.md) · [parcel demo script](DemoScript-Parcel.md) · [QA proof](QA-Proof.md)

**Read first:** [UBC win strategy](../../ubc/UBC-Hackathon.md#win-strategy) · [demo timing](../../ubc/UBC-Hackathon.md#demo-and-submission) · [Vision](../../design/Vision.md) · [Problem story rules](../../context/Problem.md#rules-for-the-story)

## Final positioning

- **Main track:** Consumer Applications. The parcel question and seamless buyer journey lead.
- **Chain award:** Best Use of Solana. The custom program, immutable participants, held rejection, exact payout, and Explorer proof establish depth.
- **QuickNode bounty:** enter only if the timeline is driven by the filtered Stream and the second-device acceptance check passes.
- **ElevenLabs bounty:** enter only if a real staged callback is central, audible in the video, and its verified webhook creates reviewer evidence.
- **Do not enter:** DeFi, Arc, Gemini, or Grok Bot unless the shipped product independently meets their published requirements. Using AI to write code or docs is not a Grok Bot integration.

Competition size is not a product argument. If asked why not DeFi: **the escrow is important infrastructure, but the product begins with an everyday buyer trying to understand land; Best Use of Solana is where we prove the financial mechanism.**

## Core script

**Opening:** “You find a vacant lot you can finally afford. Before you send a deposit, you need two answers: can I build here, and does the person asking for my money own it?”

**Product:** “GroundTruth turns public parcel records into a plain-English evidence report. It tells you what we found, what still needs a professional, and who acts next. When you proceed, test USDC sits in a Solana escrow until the staged title, survey, and septic reviewers sign.”

**Turn:** “This deal looked ready—until the owner picked up the phone and said, ‘I’m not selling.’”

Then show the reviewer hold, attempt release, and pause on the unchanged vault. Move to the second immutable deal, show the last approval arrive through QuickNode, release, and pause on the exact seller balance increase and Explorer receipt.

**Close:** “GroundTruth does not replace the professionals. It makes their evidence and decisions understandable to the buyer—and makes the payment obey them.”

## Deliverables

- Public GitHub repository with fresh-clone instructions and the exact program ID/network/sponsor roles.
- Public Vercel app and Railway API that open signed out.
- Accessible 2–3 minute video with audible voice footage, captions, and both transaction receipts.
- Five-minute stage deck/demo with a 20-second latency buffer and a rehearsed offline fallback.
- Proof sheet: deployed commit, program ID, test-USDC mint, two deal PDAs, held error/signature, cleared release signature, before/after balances, QuickNode Stream configuration summary, ElevenLabs conversation ID, and source URLs for the golden parcel.
- Reset sheet that creates fresh staged deals or selects the preserved receipts without editing chain/database state by hand.

## Acceptance checks

1. A teammate who did not build the screen runs the demo from the reset sheet and correctly explains the parcel gap, active hold, unchanged balance, final approval, and exact payout.
2. The submission selects Consumer Applications, Best Use of Solana, and only sponsor bounties whose phase 3 proof exists.
3. Repo, app, API health route, video, source links, and Explorer links open in a private browser window.
4. The video is 2–3 minutes, has audible ElevenLabs output if entered, labels staged roles/test funds/illustrative activity, and never claims GroundTruth gives legal advice or verifies a real owner.
5. The five-minute run finishes in 4:40 during three consecutive rehearsals; Q&A owners can answer custody, reviewer trust, refund rules, source coverage, privacy, and why blockchain.

## Q&A answers that must stay consistent

| Question | Answer |
| --- | --- |
| Why blockchain? | The program makes the hold, approval set, mint, amount, and payout destination enforceable and independently verifiable; the report alone cannot do that. |
| Who decides whether a seller is legitimate? | A staged title reviewer. ElevenLabs provides callback evidence; it never authorizes payment. |
| Can GroundTruth say a home is buildable? | It shows sourced facts, limitations, and responsible professionals. A production partner makes qualified decisions. |
| What is on-chain? | Reviewer decisions, hold, vault state, and settlement. PII, call contents, and documents stay off-chain. |
| Why Ohio? | OGRIP publishes a standardized statewide parcel layer, giving broad real discovery while the team proves deeper evidence on one jurisdiction. |
| What happens after a hold? | Release remains impossible. Under the hackathon contract the buyer can refund the full vault; production terms would be defined with a title/closing partner. |

## Cut line

The submission is a product demonstration, not a week-in-review. Remove architecture slides, extra features, and sponsor logos that do not advance the buyer story. Keep the real sources, program rejection, exact payout, and next actor. A missing sponsor integration narrows the bounty list; it never blocks the Consumer + Solana submission.
