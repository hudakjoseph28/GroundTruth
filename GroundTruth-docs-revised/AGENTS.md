# GroundTruth agent guide

**Goal:** Win UBC with a first-time land-buying product backed by public parcel data and verifiable Solana escrow. The main track is open between **Consumer Applications** and **DeFi & Onchain Applications**. Use the UBC brief to make that decision from the working demo.

**Current priority:** Target Ohio-wide parcel discovery with deeper, source-backed reports where records support them. Prove that a buyer can research across counties and that a disputed closing holds funds while a cleared closing pays out on Devnet. The architecture is a discussion draft.

## Read before you work

Skim all four docs when you first join. For a scoped task, reread the relevant sections and inspect the affected files or fixtures.

| Context | Where to start |
| --- | --- |
| Buyer, problem, evidence, and product scope | [Problem.md](docs/context/Problem.md) |
| Track decision, judging, awards, and deadlines | [UBC-Hackathon.md](docs/ubc/UBC-Hackathon.md) |
| Web, mobile, data flow, and settlement boundaries | [Architecture.md](docs/architecture/Architecture.md) |
| Assigning, resuming, or handing off a task | [Prompt.md](docs/agents/Prompt.md) |

1. Own one outcome at a time. Coordinate changes to any shared assumption about coverage, deal states, or platform choices with the affected workstreams.
2. Label what the evidence supports. A parcel boundary establishes map coverage. A report cites each source and surfaces gaps. A reviewer signs the decision, and Solana determines the payment state.
3. Verify the affected path. For search, try multiple counties and a missing-data case. For closing, check both the held and released balances when Devnet is available. For phone handoff, check that the correct deal opens for the signed-in buyer.
4. Report changed paths, checks actually run, and any dependency the next person needs. Follow the maintainer’s requested commit, push, and publishing workflow.
