# GroundTruth

**Know the land. Know what comes next.**

GroundTruth helps first-time vacant-land buyers in Ohio find a parcel, see a source-backed report on what's known and what's still open, and know exactly who acts next. When they're ready to pay, a Solana devnet USDC escrow holds the money: a reviewer's hold blocks the payout, and cleared sign-offs release it to the seller. Public records supply the evidence, professionals sign the decisions, and the chain enforces where the money goes.

Built for the [UBC 2026 Hackathon](docs/ubc/UBC-Hackathon.md). **Main track: Consumer Applications. Chain award: Best Use of Solana.** Build window: Thu Nov 12, 7:00 p.m. ET kickoff → Devpost submission **Fri Nov 20, 1:00 p.m. ET** (team target 11:00 a.m. ET). Finals in person at UT Austin, Nov 21.

## Ship contract

By the first end-to-end checkpoint, a judge can open the public site, search real Ohio parcels, inspect one honest source-backed report, and run two staged closings: one payout rejected because a title hold is active and one payout released to the bound seller after every required approval. The result is not a marketplace, legal opinion, title product, or deed-transfer system. It is a polished decision-and-payment prototype with verifiable evidence.

**Repository status on Nov 12:** `@groundtruth/shared` is the v1 contract. `@groundtruth/web` can search the staged parcel and open it. `@groundtruth/backend` serves `GET /api/health` and `GET /api/parcels/:parcelKey/report` from a local Postgres seed. `escrow` is still empty.

**Deployed on Nov 14:** web at <https://groundtruth-lac.vercel.app> (Vercel) and API at <https://api-production-db8a8106.up.railway.app> (Railway, with its own Postgres). The web forwards `/api/*` to the API, so browser code calls relative `/api/...` paths. The API serves health, the staged parcel report, and the staged deal and timeline. How to redeploy: [backend/README.md](backend/README.md#deployment).

Do not describe a route, test, deployment, or integration as working until the corresponding artifact exists and has been run.

## The demo story

1. **Find it.** A first-time buyer searches real parcels across Ohio counties by address or parcel ID.
2. **Understand it.** They open a lot and see its biggest open question (say, legal road access) with the dated source and who can resolve it.
3. **Block a bad payout.** On a disputed deal, an ElevenLabs owner callback flags the seller, a title reviewer signs a hold, and the release **fails on-chain** with the balance intact.
4. **Release a good one.** On a cleared deal, the final approval lands through a QuickNode Stream and the seller is paid in devnet USDC, with an Explorer link for both outcomes.

## Team and roles

These are the working assignments. A changed assignment is written here and in the affected phase file before work moves.

| Owner | Owns | Phase |
| --- | --- | --- |
| **Joey Hudak** | Buyer UI / frontend (web): homepage + globe, search, parcel report, closing view | 2 & 3 (UI) |
| **Gagan** | Parcel evidence and data: Ohio OGRIP parcels, FEMA flood, the report pipeline. Gagan originated the GroundTruth idea. | 2 |
| **Kadhir** | Solana escrow: Anchor program, USDC vault, hold, release, refund | 1 |
| **Satya** | Backend API, integrations (QuickNode Streams, ElevenLabs), deployment | 3 |

The frontend should be the lightest and quickest piece to ship (target: under 3 days). After that, **Joey floats and helps anywhere**, starting with backend and escrow integration.

## Decisions that are closed

- **Product:** Ohio-first parcel research followed by conditional settlement; responsive web is the product and native mobile is out of scope this week.
- **Competition:** Consumer Applications + Best Use of Solana; QuickNode Streams and ElevenLabs are entered only after their acceptance checks pass.
- **Stack:** pnpm workspace, Vite + React + TypeScript, Express + Prisma + PostgreSQL, Anchor on Solana devnet, Vercel for web, Railway for API and database.
- **Data:** OGRIP statewide parcels for discovery; deeper evidence only where an authoritative source is verified. Missing data remains missing.
- **Contract:** everyone codes against [DataContract.md](docs/architecture/DataContract.md) (v1). Change it deliberately with the affected owners; never fork a private version.

## Repo map

```text
README.md                 ← you are here
AGENTS.md                 rules for AI agents (and humans) working in this repo
docs/
  ubc/UBC-Hackathon.md    tracks, prizes, judging, dates, submission checklist
  context/Problem.md      the buyer, the problem, the cited evidence
  context/ReferenceBuilds.md  earlier projects: what to adapt, what to leave behind
  architecture/Architecture.md  system boundaries and flows
  architecture/Decisions.md     accepted hackathon decisions and replacement triggers
  architecture/DataContract.md  shared types, REST routes, escrow instructions (v1)
  design/Vision.md        how the website should look and feel (+ vision.jpg)
  phases/                 build order, owners, acceptance checks
  agents/Prompt.md        task template for handing work to an agent
packages/shared/          `@groundtruth/shared` v1 types and staged fixtures
frontend/web/             Vite app: homepage, staged search, parcel view
frontend/mobile/          reserved; native app is out of core scope
backend/                  Express API: health and staged parcel report
escrow/                   Anchor program (empty until scaffold)
```

## Quickstart

Use Node 26 (`.nvmrc`). From a fresh clone, `npm run setup` installs the locked packages with pnpm 12.18.0 and builds them. pnpm does not need to be on `PATH`.

```bash
npm run setup
pnpm -r typecheck
pnpm lint
pnpm format
```

These five commands passed on Nov 12, 2026. `pnpm dev`, `pnpm test`, and `pnpm escrow:test` are not set up yet.

```ts
import {
  type Deal,
  type Parcel,
  goldenParcel,
  goldenReport,
  stagedDeal,
} from "@groundtruth/shared";
```

## Definition of a winning build

- The public URL loads signed out and the primary search action is obvious in five seconds.
- Search returns real OGRIP parcel boundaries from at least two Ohio counties; the golden parcel report shows a dated source, an explicit gap, and the next responsible person.
- The held deal rejects release on-chain without changing buyer, vault, or seller balances.
- The cleared deal pays the exact test-USDC amount once; every on-chain claim has a devnet Explorer link.
- An ElevenLabs call creates evidence for a human reviewer; it never creates an approval by itself.
- A QuickNode Stream drives the confirmed closing timeline on a second browser or phone.
- The 2–3 minute video, repo, and deployed app all open for a signed-out judge.

## Read next

| You are… | Read |
| --- | --- |
| Everyone (15 min once) | This README → [Problem](docs/context/Problem.md) → [Architecture](docs/architecture/Architecture.md) → [Data contract](docs/architecture/DataContract.md) → [Phases](docs/phases/README.md) → [Vision](docs/design/Vision.md) → [UBC brief](docs/ubc/UBC-Hackathon.md) |
| Frontend | [Vision](docs/design/Vision.md), [DataContract](docs/architecture/DataContract.md), [Phase 2](docs/phases/02-parcel-research/ParcelResearch.md) |
| Parcel data | [Phase 2](docs/phases/02-parcel-research/ParcelResearch.md), [Problem](docs/context/Problem.md), Terra-Zone in [ReferenceBuilds](docs/context/ReferenceBuilds.md#terra-zone) |
| Escrow | [Phase 1](docs/phases/01-escrow/Escrow.md), [DataContract](docs/architecture/DataContract.md#escrow-v1), Accord in [ReferenceBuilds](docs/context/ReferenceBuilds.md#accord) |
| Backend / integrations | [Phase 3](docs/phases/03-connect-surfaces/ConnectSurfaces.md), [Architecture](docs/architecture/Architecture.md), [UBC brief](docs/ubc/UBC-Hackathon.md) |
| An AI agent | [AGENTS.md](AGENTS.md), then [Prompt.md](docs/agents/Prompt.md) |
