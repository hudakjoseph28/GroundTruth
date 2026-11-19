# GroundTruth · Decision log

**Accepted Nov 12, 2026. These are build instructions, not discussion prompts.** The team optimizes for a convincing, reproducible hackathon vertical slice. Reconsider a decision only when its replacement trigger occurs; record the evidence and replacement here in the same change.

| ID | Accepted decision | Why this is the answer for this week | Replacement trigger |
| --- | --- | --- | --- |
| D1 | **Accepted.** pnpm workspace with `frontend/web`, `backend`, `packages/shared`, and `escrow` | One install and one shared TypeScript contract let four owners build without copying types. | pnpm cannot install or run on a teammate's target machine and the exact failure is recorded. |
| D2 | **Vite + React + TypeScript** for one responsive web app | Fast scaffold, static deployment, and no server-rendering requirement. Desktop and phone share routes and components. | A required wallet or mapping library fails in a minimal Vite spike. |
| D3 | **MapLibre GL JS** for parcels and **react-globe.gl** for the homepage atmosphere | MapLibre handles GeoJSON boundaries without a paid map SDK; react-globe.gl supplies the designed points/arcs/drag interaction. Search loads before the globe. | Globe misses the performance/reduced-motion check; replace it with a static canvas, not a new product dependency. |
| D4 | **Express + TypeScript + Zod + Prisma + PostgreSQL** in `backend` | Familiar request lifecycle, explicit validation, durable webhook dedupe, and a schema the backend and data owners can inspect quickly. | Railway cannot run the service/database or Prisma blocks the first vertical slice; use direct `pg`, not a second ORM. |
| D5 | **Anchor program on Solana devnet** with Circle's test USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Anchor gives account constraints, generated clients, and the strongest path to tested program rules. | Circle changes the published mint or Solana devnet is unavailable; update the verified test mint and label it. Do not silently use mainnet or native SOL. |
| D6 | **Responsive web only** for the core build. `frontend/mobile` stays reserved. | A QR can open the same deal route on a phone without an install, native-wallet, push, or app-store risk. | The complete web, API, escrow, Streams, and voice acceptance checks pass before the freeze; only then may Expo become a stretch. |
| D7 | **Consumer Applications** main track + **Best Use of Solana** chain award | UBC describes Consumer as an everyday app where crypto is invisible. Parcel research is the entry point; escrow is the Solana proof. GroundTruth is not primarily a new composable DeFi primitive. | Only an organizer rule makes the entry ineligible. Competition guesses are not a trigger. |
| D8 | **Vercel** for `frontend/web`; **Railway** for the Express API and PostgreSQL | Public HTTPS, straightforward static hosting, persistent API process, database, and webhook endpoint. | Account/access failure blocks deployment for 30 minutes; use one owner-approved equivalent and update every URL/env example. |
| D9 | **Public staged demo data; wallet authorization for actions.** No production user-account system this week. | The stage flow contains no real PII. Removing account setup keeps focus on evidence and program authorization. | Real personal/contact/title data enters the system; then authentication and row-level authorization become mandatory before ingestion. |
| D10 | **Polling every 2 seconds** for the first connected timeline; add server-sent events only after the Stream works | The sponsor value is confirmed Stream ingestion, not a fragile socket layer. Polling is reliable across Vercel/Railway and sufficient on stage. | Polling makes the second-device update visibly late or exceeds provider limits after measurement. |
| D11 | **Vitest + Testing Library + Supertest** for TypeScript; **Anchor/Mocha** for the program | One test runner per runtime and clear phase acceptance checks. | A scaffolded official template already supplies an equivalent runner; keep it rather than churn. |

## Consequences everyone codes to

- `packages/shared` owns the v1 API schemas, TypeScript types, fixture builders, deal state labels, and error envelope. The Markdown contract explains them; checked-in code becomes executable truth once it exists.
- Browser code never receives provider or webhook secrets. It calls only the GroundTruth API and the user's wallet adapter.
- The OGRIP, FEMA, QuickNode, and ElevenLabs payloads are translated inside backend adapters. Provider field names never become UI props.
- No native app, generalized multi-state ingestion platform, production identity product, marketplace, deed NFT, or AI verdict before the complete vertical slice.
- Use two immutable staged deals for the two terminal outcomes. Never “reset” a released on-chain account to fake a rerun.

## Change format

Append a dated row instead of erasing history:

| Date | Decision | Evidence | Replacement | Owners |
| --- | --- | --- | --- | --- |
| — | No replacements yet | — | — | — |
| 2026-11-12 | D1 accepted | `pnpm install --frozen-lockfile`, `pnpm -r build`, `pnpm -r typecheck`, `pnpm lint`, and `pnpm format` passed from a clean checkout | none | Joey Hudak |
| 2026-11-19 | Deal documents: approval memos use SPL **Memo v1** (`Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo`) and the API reads the memo from the instruction, not the logs | On devnet, `getAccountInfo MemoSq4gqABAXKb96qnH8TyNmwnmJ6NerJ2SZcfSLgW` returned `"value": null` (slot 523847109) and simulating `sign_approval` + a Memo v2 instruction failed with `ProgramAccountNotFound`. Memo v1 is deployed (executable, BPFLoader1) but logs nothing of its text. | The web sends Memo v1; the QuickNode filter adds `memos` (text of top-level Memo v1/v2 instructions, from jsonParsed) to successful entries; no change to the escrow program. Switch back to v2 only if it is redeployed on devnet; the filter already accepts both. | Gagan |

A replacement is complete only when [README](../../README.md), [Architecture](Architecture.md), [DataContract](DataContract.md), affected phase files, environment examples, and deployment notes agree.
