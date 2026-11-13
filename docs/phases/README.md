# GroundTruth · Phases

**Build order for the weekend.** Escrow and parcel research start together. Connecting the two surfaces waits until each has a fixture a teammate can run. The pitch is chosen from that demo, using the track comparison in the [UBC brief](../ubc/UBC-Hackathon.md).

These phases turn the implementation order in [Reference builds](../context/ReferenceBuilds.md) into work the four owners can pick up. The [architecture](../architecture/Architecture.md) remains the boundary for reports, deals, and payment. Dates below match the proposed checkpoints in the UBC brief.

| Phase | Outcome | Starts | Folder |
| --- | --- | --- | --- |
| 1 · Escrow | A disputed payout stays funded, and a cleared payout pays the bound seller on Devnet. | Nov 13 locally, Devnet proof Nov 14–15 | [01-escrow](01-escrow/Escrow.md) |
| 2 · Parcel research | Search and map parcels in more than one Ohio county, with a sourced report and an incomplete report. | Nov 13, in parallel with escrow | [02-parcel-research](02-parcel-research/ParcelResearch.md) |
| 3 · Connected surfaces | A signed reviewer decision shows on the web and on a second device. Voice supplies evidence. A Stream supplies confirmed chain state. | After both fixtures exist. Target Nov 16–17 | [03-connect-surfaces](03-connect-surfaces/ConnectSurfaces.md) |
| 4 · Pitch | Choose Consumer Applications or DeFi & Onchain Applications from the working demo. | After the core journey runs. Target Nov 18 | [04-pitch](04-pitch/Pitch.md) |

Assign one owner each to buyer UI, parcel evidence, Solana escrow, and voice/Streams and deployment. Phases 1 and 2 share the report and deal fixtures. A task inside a phase should use the [task prompt](../agents/Prompt.md) and name that phase file.
