# GroundTruth agent guide

**Goal:** Win UBC 2026 with a land-buying product a first-time buyer actually understands: real Ohio parcel discovery, source-backed reports, and a Solana devnet escrow where a reviewer hold blocks payout and cleared sign-offs release it.

**Now:** submission polish. The stack is built and deployed: Ohio-wide parcel search with live reports (deeper in Franklin County), the escrow program on devnet with both staged closings run (one held, one released), the reviewer portal, QuickNode Streams, and the ElevenLabs owner callback. See [README](README.md) for what is live and [Readiness](docs/phases/04-pitch/Readiness.md) for what is still open. The escrow is the technical case for **Best Use of Solana**; the main track is recorded in one place, the README's `Track:` line. [Decisions.md](docs/architecture/Decisions.md) is locked for the hackathon. Do not reopen a decision inside an implementation PR unless the accepted option is demonstrably blocked.

## Team and roles

These are the current owners. Update this table and the phase file before transferring an outcome.

| Owner | Owns | Folder |
| --- | --- | --- |
| Joey Hudak | Buyer UI / responsive web. Target: ship the core screens in under 3 days, then float to backend and escrow integration. | `frontend/web` |
| Gagan Karnati | Parcel evidence and data: Ohio OGRIP parcels, FEMA flood, USDA SSURGO soils/septic screening, report pipeline. Originated the idea. | `backend` (report pipeline) |
| Kadhir | Solana escrow: Anchor program, USDC vault, hold, release, refund | `escrow` |
| Satya | Backend API, QuickNode Streams, ElevenLabs, deployment | `backend`, deployment |

## Read before you work

On your first task, skim **every Markdown file in this repository once**; the full set is short enough to prevent expensive contradictions. Start with [README.md](README.md), then read: [Problem](docs/context/Problem.md) → [Architecture](docs/architecture/Architecture.md) → [DataContract](docs/architecture/DataContract.md) → [Decisions](docs/architecture/Decisions.md) → [Phases](docs/phases/README.md) → [Vision](docs/design/Vision.md) → [UBC brief](docs/ubc/UBC-Hackathon.md) → [Reference builds](docs/context/ReferenceBuilds.md) → [Prompt](docs/agents/Prompt.md). On later tasks, reread only the contract and phase sections you touch.

## Rules

1. **Own one outcome at a time.** State the buyer-visible outcome, paths, and acceptance checks before editing. Finish or hand it off before starting another.
2. **Use the accepted answer.** Implement [Decisions.md](docs/architecture/Decisions.md). If a library or provider is blocked, capture the exact failing command or response, choose the smallest compatible fallback, and update the decision log in the same change.
3. **Say exactly what the evidence supports.** A parcel boundary proves map coverage. A report cites each source and names each gap. A reviewer signs the decision. Solana decides whether money moves. Never fabricate a finding, fallback value, demo count, transaction, or statistic.
4. **Keep boundaries intact.** Web never talks to OGRIP, ElevenLabs, QuickNode, PostgreSQL, or Solana RPC with a secret. API never signs for a buyer, seller, or reviewer. Voice output is evidence, not authorization. Confirmed chain state wins over cached state.
5. **Verify the path you touched.** Run the narrow test first, then the package-level lint/typecheck/test/build commands that exist. Search work covers two counties and one missing-data case. Closing work records held and released balances. Never claim a command you did not run.
6. **Write original code.** UBC requires work created during the event. Reference builds are patterns, not paste sources.
7. **Hand off cleanly.** Report changed paths, commands and results, screenshots or transaction links where relevant, remaining dependency, and the next executable action. Follow the maintainer's commit and push workflow.

## Default behavior under ambiguity

- Prefer a small working vertical slice over a generalized framework.
- Preserve the public interfaces in `DataContract.md`; add an adapter behind them instead of leaking provider payloads into UI code.
- Treat `unknown` as a valid product state. Never turn provider failure into a negative or positive land-use conclusion.
- Keep staged roles and test funds visibly labeled.
- Do not stop for a stylistic preference. Stop only for credentials, a destructive action, a contract conflict, or a claim that cannot be made truthfully.

## Where code goes

`frontend/web` has the homepage, live Ohio parcel search, the parcel view, the deal page (`/deals/:dealId`), which reads deal state and the timeline from the API, and the reviewer portal (`/review`), where a reviewer's own wallet signs approvals, holds, and releases built from the checked-in IDL. `backend` searches live Ohio OGRIP parcels, builds live parcel reports with FEMA flood and USDA SSURGO soils/septic checks, and serves the two seeded reports from Postgres; see [Coverage](docs/phases/02-parcel-research/Coverage.md). `frontend/mobile` is reserved (no native app; the web is responsive); `escrow` implements the 6 Anchor escrow instructions on Solana devnet. Put new files in the folder that matches the surface.

| Folder | What belongs here |
| --- | --- |
| `frontend/web` | Homepage, globe, search, parcel report, browser closing flow |
| `frontend/mobile` | Reserved; no native app until the responsive web demo is complete |
| `backend` | Shared server: parcel lookup, reports, deal access, Streams and voice intake |
| `escrow` | Anchor program that funds, holds, releases, and refunds devnet USDC |
