# GroundTruth · Phases

**Build order.** Scaffold once, then escrow and parcel research start together. Connecting the surfaces begins as soon as each side exposes a fixture another owner can run. Pitch work turns the verified build into a Consumer Applications story; it does not reopen the track. Boundaries live in [Architecture](../architecture/Architecture.md), interfaces in [DataContract](../architecture/DataContract.md), and dates in the [UBC brief](../ubc/UBC-Hackathon.md#milestones).

| Phase | Exit artifact | Owner | When | File |
| --- | --- | --- | --- | --- |
| 1 · Escrow | A disputed payout stays funded; a cleared payout pays the bound seller on devnet. | Kadhir (Joey helps on client integration) | Local from Nov 13, devnet proof Nov 14–15 | [Escrow](01-escrow/Escrow.md) |
| 2 · Parcel research | Real parcels mapped in 2+ Ohio counties, one sourced report, one incomplete report. | Gagan (data) + Joey (UI) | From Nov 13, in parallel | [ParcelResearch](02-parcel-research/ParcelResearch.md) |
| 3 · Connected surfaces | A signed reviewer decision shows on web and a second device. Voice supplies evidence; a Stream supplies confirmed chain state. | Satya (Joey on UI) | After both fixtures exist; target Nov 16–17 | [ConnectSurfaces](03-connect-surfaces/ConnectSurfaces.md) |
| 4 · Pitch | Consumer submission, 2–3 minute video, 5-minute stage run, and Q&A proof sheet. | Whole team | After the core journey runs; target Nov 18 | [Pitch](04-pitch/Pitch.md) |

Owners are active assignments (see [README](../../README.md#team-and-roles)). Phases 1 and 2 share the verified golden parcel and canonical deal values, but use **two independent on-chain deals** so held and released receipts both survive. A phase exits only when its named commands and manual proof pass; “the code is mostly written” is not a phase result. Hand one route, component, adapter, instruction, or integration to an agent with the [task prompt](../agents/Prompt.md).

## Cross-phase gate

Before phase 3 integration, the web must render the four canonical fixtures, the API must serve the same v1 shapes, and local Anchor tests must emit the documented events. If any owner has invented a different status, ID, wallet role, or amount, fix the contract drift before adding sponsor integrations.
