# Phase 3 · Connected surfaces

**Owner:** Satya (backend, Streams, ElevenLabs, deployment). Joey owns the closing UI and responsive deal route.

**Outcome:** A buyer who researched a parcel opens the same staged deal in a second browser or phone-sized route and sees a reviewer decision arrive from confirmed chain state. The disputed path includes a real ElevenLabs callback to a consenting teammate as evidence for that reviewer.

**Read first:** website, phone, and closing diagram in [Architecture](../../architecture/Architecture.md) · deal routes in [DataContract](../../architecture/DataContract.md#http-api-v1) · [SolMail](../../context/ReferenceBuilds.md#solmail) · QuickNode and ElevenLabs rows in the [UBC brief](../../ubc/UBC-Hackathon.md#what-were-entering)

## Deliverables

- Deployed Express API and PostgreSQL database on Railway, deployed web on Vercel, and checked-in `.env.example` files with names but no secrets.
- HMAC/signature-verified, idempotent QuickNode and ElevenLabs webhook handlers at the v1 routes.
- One filtered Solana devnet Stream scoped to the deployed GroundTruth program; its configuration is documented without the secret.
- One ElevenLabs agent/call configuration using staged data and a consenting teammate; conversation ID and demo outcome saved, raw audio/transcript not copied into Git or the app database.
- Parcel-question microphone input transcribed by ElevenLabs, with the answer read in the voice configured on that agent; keys stay on the API.
- Responsive `/deals/:dealId` view, desktop QR, two-second timeline polling, and Explorer links.

## Build this

- **Desktop and phone-sized layouts share the deal API and identity.** The QR carries the public HTTPS route for one staged, non-sensitive deal. Viewing requires no credential; wallet actions still require a bound staged wallet. Real/private deals are out of scope until authentication exists.
- **ElevenLabs supplies evidence** for the disputed closing. The assigned reviewer decides whether to sign a hold.
- **QuickNode Streams feeds the live timeline:** a signed change on one device updates the other after the chain confirms it. The web polls the GroundTruth API every two seconds; SSE is optional only after this path works. Voice and model output stay advisory.
- **Configure devnet explicitly** on every client and agent path.
- **Verify and deduplicate both webhooks.** QuickNode uses the configured HMAC token and signature + event index; ElevenLabs uses its signature and conversation ID. Parse the raw body before JSON middleware mutates it.

## Leave out

A phone agent that can release or refund, SolMail's email score policy, hard-coded instruction discriminators from another program, native push, native mobile, and a production account system. The second device proves synchronized confirmed state; it does not need to sign.

## Demo scope

One filtered Stream, one consenting teammate on the ElevenLabs call, one second device. The disputed deal plays the callback, records the hold, and shows the rejected release. The cleared deal shows the final approval arriving through the Stream, then the payout. Push notifications only if an installed build, permissions, and platform credentials are ready; the mobile-web route covers judges either way.

## Acceptance checks

1. Open the staged deal link in a phone-sized browser. A reviewer approval appears within the measured Stream + polling latency, and a refresh shows the same deal and receipt.
2. The public staged response contains no private evidence, owner contact data, call transcript/audio, secret, or private key. An unbound wallet cannot approve, hold, release incorrectly, or refund.
3. The callback result reaches the reviewer as evidence. The reviewer's signature, not the call, is what the program checks. The Stream event matches the saved transaction signature.
4. A voice parcel question follows the same report-only answer path as text and returns a cited answer; unsupported questions remain explicit gaps.

Run and report:

```bash
pnpm --filter backend test
pnpm --filter backend typecheck
pnpm --filter web test
pnpm build
```

Manual proof records the public app/API URLs, Git commit, program ID, Stream name/filter scope/destination, callback conversation ID, transaction signature, event receipt time, and second-device display time. Replay both webhook payloads once and prove no duplicate timeline row appears.

## Cut line

Verified Stream ingestion and the staged call are the sponsor proof. Native push, websockets/SSE, an installed app, and generalized notification preferences are stretch work. If live telephony is flaky on stage, play a labeled recording of the real integration and keep the original conversation ID; never substitute a hand-edited database row.

## Depends on

[Phase 1](../01-escrow/Escrow.md) provides held and released transactions. [Phase 2](../02-parcel-research/ParcelResearch.md) provides the parcel. This phase wires those fixtures to the second device, the call, and the Stream.
