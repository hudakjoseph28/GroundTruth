# GroundTruth

**Know the land. Know what comes next.**

GroundTruth helps first-time vacant-land buyers in Ohio find a parcel, see a source-backed report on what's known and what's still open, and know exactly who acts next. When they're ready to pay, a Solana devnet USDC escrow holds the money: a reviewer's hold blocks the payout, and cleared sign-offs release it to the seller. Public records supply the evidence, professionals sign the decisions, and the chain enforces where the money goes.

Built for the [UBC 2026 Hackathon](docs/ubc/UBC-Hackathon.md). **Main track: Consumer Applications. Chain award: Best Use of Solana.** Build window: Thu Nov 12, 7:00 p.m. ET kickoff → Devpost submission **Fri Nov 20, 1:00 p.m. ET** (team target 11:00 a.m. ET). Finals in person at UT Austin, Nov 21.

## Ship contract

By the first end-to-end checkpoint, a judge can open the public site, search real Ohio parcels, inspect one honest source-backed report, and run two staged closings: one payout rejected because a title hold is active and one payout released to the bound seller after every required approval. The result is not a marketplace, legal opinion, title product, or deed-transfer system. It is a polished decision-and-payment prototype with verifiable evidence.

## What's live

Checked Nov 18, 2026 against the deployed site and API and the public devnet RPC.

| Surface | Where | What it does today |
| --- | --- | --- |
| Web | <https://groundtruth-lac.vercel.app> (Vercel) | Homepage, search of live Ohio parcels by address or parcel ID, and a parcel page with the boundary Ohio publishes, a 3D land view, and a source-backed report. The golden parcel's closing strip still reads a bundled staged fixture, not the API, and there is no deal page yet. |
| API | <https://api-production-db8a8106.up.railway.app> (Railway, with its own Postgres) | `GET /api/health`, `/api/coverage`, `/api/parcels/search`, `/api/parcels/:parcelKey`, `/api/parcels/:parcelKey/report`, `/api/deals/:id`, `/api/deals/:id/timeline`, and signed webhooks for QuickNode and ElevenLabs. The web forwards `/api/*` here, so browser code calls relative paths. |
| Escrow | Solana devnet, program [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet) | Anchor program with 6 instructions (`initialize_deal`, `fund`, `sign_approval`, `place_hold`, `release`, `refund`) and 6 events, covered by 78 Anchor integration tests. Both demo closings ran on Nov 18. |

Merging to `main` does not redeploy; see [backend/README.md](backend/README.md#deployment).

**Parcel data.** Search and boundaries come from Ohio's statewide OGRIP parcel layer, which covers all 88 counties. We tested it in Franklin and Licking counties. On `main`, a lot published with house number 0, such as the golden parcel at `0 SEAMAN RD`, is found by locating the street, because the address locator has no point for house number 0. The deployed API picks this up at its next deploy. Live reports add a FEMA flood check in the 83 counties with an NFHL study, and a zoning check in Franklin County. Seeded reports cover the golden parcel `ohio:39049:230-000918` (Franklin) and the second-county parcel `ohio:39089:00500729609000` (Licking). Missing or timed-out evidence stays `unknown`. What was tested: [Coverage](docs/phases/02-parcel-research/Coverage.md).

**Escrow on devnet.** Program [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet), deployed in [`4jSbDsp…P8NU`](https://explorer.solana.com/tx/4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU?cluster=devnet) (#22). Its on-chain Anchor IDL ([`uQZLX7r…wZma`](https://explorer.solana.com/address/uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma?cluster=devnet)) is identical to the checked-in one. Both closings use the golden parcel, 25 test USDC (Circle's devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`), and staged wallets for the buyer, the seller, and the title, survey, and septic reviewers. All eleven transactions are finalized.

| Deal | Outcome | Key transactions |
| --- | --- | --- |
| Held, [`54Va6q…E4tW`](https://explorer.solana.com/address/54Va6qKNQTsbuXTqi4tXaPVgdkQh4S7McsCKsjKPE4tW?cluster=devnet) | The title reviewer's hold blocked the payout. The release was **rejected** with `DealHeld (6019)`: vault 25 → 25, seller 0 → 0. The buyer was then refunded. | Fund [`grkKU9…dd74`](https://explorer.solana.com/tx/grkKU9YqV1xpAkHySCjdhLgavpd5dW3mJsvbiZ1tjEyvuHC9T373Hmscubsm8UapaA7j93pHrseJMepw1C3dd74?cluster=devnet) · hold [`5QovFT…J2ib`](https://explorer.solana.com/tx/5QovFTbAMquUY5M5NpJwZPUJhtcKAcmQ5xmZhvFWT46KfPh3UBkaQMhgQhcuphBqvTiYLUgTmNNS7b8tyR7JJ2ib?cluster=devnet) · rejected release [`Rro8WA…vwGz`](https://explorer.solana.com/tx/Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz?cluster=devnet) · refund [`SgPJ9j…yaSo`](https://explorer.solana.com/tx/SgPJ9jQCNZfHrp1ipKK3tQ6LYwSaGS9qdhpkshUt8zNJW9JJ2s5V8B9WYuzq5nxLy3sWGvT94ZduEvSDgMzyaSo?cluster=devnet) |
| Released, [`3uBECm…y2yu`](https://explorer.solana.com/address/3uBECmkG9XKbJbGisPjqWNxy6Sb3knVZ2cnwF7jby2yu?cluster=devnet) | After three reviewer approvals, the release **paid exactly 25 test USDC** to the bound seller (0 → 25) and closed the vault. | Fund [`4a2HxS…txgR`](https://explorer.solana.com/tx/4a2HxSta9rKio7BsFMVzTvKfA9yBBSzr9uFzJEtDDNG3wJi7hzsJCgkM8SuCt3qQfkUCg4VUM8VCwxHykhDwtxgR?cluster=devnet) · approvals [`5Rnsas…jBqt`](https://explorer.solana.com/tx/5Rnsas4nLpLJM8ss63dB2768wbTRJteEWBMCE7Z4njzE1JNk547WQ7nQdp38W8Go25tX2YsQtvvn5nRNdEV5jBqt?cluster=devnet) [`3D8ahB…jL9P`](https://explorer.solana.com/tx/3D8ahBLYuhCiZfNZcMgQZZ3UQnHeoNcBFCgu9NLbyao1TZUMCKBn4RjWcKYJhQupNiZy1JiXnyN8UUARFM57jL9P?cluster=devnet) [`7tnvjT…S2fb`](https://explorer.solana.com/tx/7tnvjTxYw6vu7xFKCDTJ4fJGjerS6SCJ3QfSkFn3N916bXaBVEmBnrYwrF9hHSFyCurox1Kct9YdcJGxm4XS2fb?cluster=devnet) · release [`5kWpcH…vHdC`](https://explorer.solana.com/tx/5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC?cluster=devnet) |

The API reports the held deal as `refunded`, and its timeline includes the confirmed `releaseRejected` row. Both deals' timeline rows were backfilled with `replay:devnet`, not delivered by the Stream, because QuickNode backfill needs a paid plan. At 19:01 UTC on Nov 18, the live API still showed the released deal as `draft` with no chain rows. The run's recorded output and each step's balances are in [#31](https://github.com/hudakjoseph28/UBC-Hackathon/pull/31).

A third deal, the stage deal `staged-devnet-deal-live` ([`2UrftJ…F6Cg`](https://explorer.solana.com/address/2UrftJMzbvMngu6Mdg4PhFscqkCHnuLksfbSAiddF6Cg?cluster=devnet), 10 test USDC), is half-run for the live demo: initialize [`jmK7fg…pPeE`](https://explorer.solana.com/tx/jmK7fg1PBNa2kYfqbvaDJ3sNWCBSUM4gAbEp529M5QHYeg145EF9RpKGaHKThkZ9PGt2Q9o1jDRFG2ny2GApPeE?cluster=devnet), fund [`5waYrx…PxH5`](https://explorer.solana.com/tx/5waYrx5rD6y7sZttZ73i7H2v1eFyqXvuCkuwxBKC11atb5DQi3CsgHrEyUYrwppxTPPHowg1uxxRejrcaVrJPxH5?cluster=devnet), and the title [`2VSXvY…sFPL`](https://explorer.solana.com/tx/2VSXvYoKQcaHxfK6V8zCFZE9imyBxE8ZF3b8RK7snsP57HxrWdpnYVWUT8puLoZ53bKzvoas2CyuvBUZeRGvsFPL?cluster=devnet) and survey [`Gj327z…M89V`](https://explorer.solana.com/tx/Gj327zRzpfPwqmnTW669iuBQ1DK8e1PTWSMoQKmZcvezZZuZTwFded8mea1bHvHsKLDnfYCBS1w4YikYeNsM89V?cluster=devnet) approvals, in slots 523727603–523727618. The septic approval and the release are saved for the stage.

## Sponsor integrations

| Sponsor | Product and role | Configuration | Status |
| --- | --- | --- | --- |
| **QuickNode** | **Streams** push confirmed escrow events into the deal timeline. Confirmed chain state wins over cached state. | Network **Solana Devnet**, dataset **Block**. The filter, [`groundtruth-filter.js`](backend/quicknode/groundtruth-filter.js), keeps successful transactions of program `ASQoBt…EBZG` and failed `release` attempts. Destination: **Webhook** → `https://api-production-db8a8106.up.railway.app/api/webhooks/quicknode`, HMAC-signed with the Stream's token. | **Live delivery recorded on Nov 18.** The stage deal's four transactions (initialize, fund, title and survey approvals; slots 523727603–523727618) reached the live deal timeline through the Stream in 1.8–3.3 s, with no replay (the team's measurement). The held and released deals were backfilled with `replay:devnet` because QuickNode backfill needs a paid plan, so they are not Stream deliveries. Not yet measured: the update on a second device. An unsigned POST to the webhook gets `401`. |
| **ElevenLabs** | **ElevenLabs Agents** outbound call (via a Twilio number). An agent phones a consenting teammate who plays the owner of record and asks whether they are selling. The answer becomes **evidence** for the title reviewer and never approves, holds, or releases a deal. | Post-call webhook `POST /api/webhooks/elevenlabs`, HMAC-verified. It stores the outcome and conversation ID, never the transcript, audio, or phone number. | Webhook deployed: an unsigned POST gets `401`. No staged call is recorded yet. |

Setup, payload shapes, and proofs: [backend/README.md](backend/README.md#quicknode-stream-webhook) and [ElevenLabs owner callback](backend/README.md#elevenlabs-owner-callback).

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
packages/shared/          `@groundtruth/shared` v1 types, golden and second-county parcel fixtures, staged deal
frontend/web/             Vite app: homepage, live Ohio parcel search, parcel view and report
frontend/mobile/          reserved; native app is out of core scope
backend/                  Express API: live OGRIP search, live and seeded parcel reports, staged deals
escrow/                   Anchor program: 6 instructions, USDC vault, reviewer holds, release, and refund
```

## Quickstart

Use Node 26 (`.nvmrc`). From a fresh clone, `npm run setup` installs the locked packages with pnpm 12.18.0 and builds them. pnpm does not need to be on `PATH`: where a command below says `pnpm`, `npx --yes pnpm@12.18.0` works the same.

```bash
npm run setup
pnpm -r typecheck
pnpm lint
pnpm --filter @groundtruth/backend test        # unit and route tests; no database or network
pnpm --filter @groundtruth/web build
```

**Run the web against the deployed API** (no database needed):

```bash
GROUNDTRUTH_API=https://api-production-db8a8106.up.railway.app pnpm --filter @groundtruth/web dev
```

Then open <http://localhost:5173> and search `230-000918` or `84 W Dodridge St`.

**Run the API locally.** Start Postgres 16, then follow [backend/README.md](backend/README.md#local-database) (`db:migrate`, `db:seed`, `dev`, port 3001). Without `GROUNDTRUTH_API`, the web dev server forwards `/api` to `http://localhost:3001`. `pnpm --filter @groundtruth/backend test:db` runs the database tests.

**Escrow:** `pnpm escrow:test` runs the 78 Anchor tests. It needs the Solana CLI, Anchor CLI, and Rust. [escrow/scripts/demo-deals.ts](escrow/scripts/demo-deals.ts) runs the two demo closings on devnet.

**CI:** [GitHub Actions](.github/workflows/ci.yml) runs on every PR to `main` and every push to it. It typechecks shared and all packages, lints, runs backend unit tests, builds the web app, and runs backend `test:db` against Postgres 16. It skips escrow/Anchor tests because they need the Solana toolchain.

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
