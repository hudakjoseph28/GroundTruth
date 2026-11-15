# @groundtruth/backend

Express API for one parcel-report read. Responses use the v1 types from `@groundtruth/shared`.

## Local database

Postgres is not started by the app. From a disposable local database:

```bash
docker run --name groundtruth-postgres \
  -e POSTGRES_USER=groundtruth \
  -e POSTGRES_PASSWORD=groundtruth \
  -e POSTGRES_DB=groundtruth \
  -p 5432:5432 -d postgres:16

cp .env.example .env
pnpm --filter @groundtruth/backend db:migrate
pnpm --filter @groundtruth/backend db:seed
pnpm --filter @groundtruth/backend dev
```

`db:seed` can be run again. It upserts the shared staged parcel `ohio:39049:STAGED-DEMO` and replaces that parcel's checks. The seeded report is `boundaryOnly`: the shared fixture has no evidence, so every check is `unknown`.

`GET /api/health` returns `{ "status": "ok", "commit": "..." }`.

`GET /api/parcels/:parcelKey/report` returns a `ParcelReport`. The parcel key is URL-encoded, for example `ohio%3A39049%3ASTAGED-DEMO`.

`GET /api/deals/:id` returns a `Deal`, and `GET /api/deals/:id/timeline` returns its `TimelineEvent[]`. Only deals seeded as public demos are readable; any other ID returns `404`. `db:seed` upserts the shared `stagedDeal` (`staged-devnet-deal`). Re-seeding rewrites the fixture's bound values and its own off-chain timeline rows only. Deal state, approvals, holds, and confirmed timeline rows come from chain events and are never reset by the seed.

Timeline rows are ordered by time, then chain slot, then event index. A confirmed row is unique by transaction signature + event index, which is the QuickNode replay guard.

## QuickNode Stream webhook

`POST /api/webhooks/quicknode` turns confirmed GroundTruth program events into deal state and timeline rows.

1. **Signature.** QuickNode signs `nonce + timestamp + body` with HMAC-SHA256, keyed by the Stream's security token (`QUICKNODE_STREAM_TOKEN`), and sends hex in `X-QN-Signature` with `X-QN-Nonce` and `X-QN-Timestamp`. The route checks it against the raw decompressed body (gzip deliveries are inflated first). With no token set, every delivery gets `503`.
2. **Payload.** The Stream filter must return exactly this shape (one entry per confirmed transaction that touched the program, in block order), or `null` to skip a block:

   ```json
   { "transactions": [{ "signature": "<base58>", "slot": 123, "blockTime": 1794700800, "logMessages": ["Program log: ..."] }] }
   ```

3. **Decode.** `logMessages` → program events needs the escrow IDL. Until it lands, the decoder throws, so the route answers `500` instead of acknowledging events it cannot read. QuickNode retries and then pauses the Stream; nothing is lost.
4. **Apply.** Each event is matched to a deal by its PDA (`escrowAddress`) and applied in one database transaction: timeline row, reviewer approval or hold, and the deal state change. Events for unknown PDAs are skipped. An event the stored deal cannot accept (approval after a hold, a second release, a payout to someone other than the bound seller, an unbound reviewer, a different amount) throws `ChainDriftError` and writes nothing.

| Response | Meaning | QuickNode does |
| --- | --- | --- |
| `204` | Applied, or already applied | Moves to the next block |
| `400` | Signed body is not the filter shape | Retries, then pauses: fix the filter |
| `401` | Signature missing or wrong | Retries, then pauses: check the token |
| `500` / `503` | Decoder missing, drift, database error, or no token | Retries, then pauses |

Replays are harmless: a timeline row is unique by transaction signature + event index, and re-applying finds it and does nothing. The timestamp is not checked against a window. QuickNode does not document its format, and deduplication already makes a replayed delivery a no-op.

### Filters

Filters live in [quicknode/](quicknode/) and are pasted into the Stream's filter editor (wizard step 2, "Stream dataset"). The **Fetch Final Payload** preview on step 3 shows the exact body the webhook will receive. QuickNode sends the filter's return value as-is, with no envelope.

| File | Use |
| --- | --- |
| `heartbeat-filter.js` | `{ "transactions": [] }` for every block. Proves signing and delivery before the program exists. |
| `groundtruth-filter.js` | The real filter. Set `PROGRAM_ID` to the deployed escrow program. Until the IDL decoder exists, deliveries it produces get `500`. |
| `inspect-filter.js` | Preview only. Reports the Block payload's field layout. |

`quicknodeFilters.test.ts` runs the filter files and posts their output to the webhook, so a shape change on either side fails a test.

### Setting up a Stream

1. Network **Solana Devnet**, dataset **Block**, start at the latest block, filter as above, destination **Webhook** → `https://api-production-db8a8106.up.railway.app/api/webhooks/quicknode`.
2. **Set the token before the Stream sends anything.** Each Stream has its own security token (Stream → Settings). With the default retry settings (every 1 s, stop after 3 failures), a Stream that starts before Railway has its token gets `503`s and is stopped within about 3 seconds. Either raise the retry settings in the destination, or set the token first and wait for the restart. A stopped Stream can be resumed with the same token.
3. Set it from your own terminal so it never lands in chat or Git: `railway variables --service api --set "QUICKNODE_STREAM_TOKEN=qnsec_..."`. Paste only the value, with no brackets. Do not rotate it afterwards without updating Railway.
4. Pause the Stream when not demoing. Streams bills per block processed, filtered or not.

### Proof: heartbeat Stream, Nov 15, 2026

| Item | Value |
| --- | --- |
| Stream | `test-stream`, Solana devnet, Block dataset, region `usa_east` |
| Filter | `heartbeat-filter.js` |
| Destination | `https://api-production-db8a8106.up.railway.app/api/webhooks/quicknode` |
| API commit | `de8c7ab` |
| Result | 117 of 117 deliveries answered `204` between 23:07:35 and 23:07:56 UTC (Railway HTTP logs): signature verified and payload accepted on the live URL |
| Filter check | `groundtruth-filter.js` with a stand-in program ID returned the expected `{ transactions: [...] }` for devnet block `522700233` in the final-payload preview |

The first start (22:56:59 UTC) was stopped after three `503`s because the token was not yet set. Resuming it after the token was set produced the run above.

## Tests

```bash
pnpm --filter @groundtruth/backend test      # unit and route tests; no database
pnpm --filter @groundtruth/backend test:db   # against DATABASE_URL after db:migrate
```

`test:db` creates and deletes its own `dbtest-*` deals; it does not touch the seeded demo rows.

## Deployment

| Surface | Host | URL |
| --- | --- | --- |
| Web | Vercel project `groundtruth` | <https://groundtruth-lac.vercel.app> |
| API | Railway project `groundtruth`, service `api` | <https://api-production-db8a8106.up.railway.app> |
| Database | Railway service `Postgres` | private network only |

Both are deployed from a local checkout with the CLIs (`railway up`, `vercel deploy`), not from GitHub, so merging does not redeploy. Satya owns both projects. From the repo root, after `railway login` / `vercel login` and linking (`railway link`, `vercel link --project groundtruth`):

```bash
railway up --service api --ci                      # API
railway variables --service api --set "GIT_COMMIT=$(git rev-parse --short HEAD)"

# Web: deploy an export of main without Git metadata (see note below).
rm -rf /tmp/gt-web && mkdir /tmp/gt-web
git archive main | tar -x -C /tmp/gt-web && cp -r .vercel /tmp/gt-web/
(cd /tmp/gt-web && vercel deploy --prod --yes)
```

Why the export: Vercel's Hobby plan **blocks** a CLI deploy when the checkout's latest commit was authored by someone other than the project owner. A PR merge commit has the merger as its author. Exporting with `git archive` sends exactly the committed tree with no commit author. `vercel ls groundtruth` shows `Blocked` if this is skipped.

- **API build:** Railpack runs `pnpm run build`. [railpack.json](../railpack.json) starts the API with `start:prod`, which runs `prisma migrate deploy`, then the compiled seed, then the server. Both are safe to repeat. Do not add `railway.json`: new Railway projects ignore its build, pre-deploy, and healthcheck settings.
- **API variables:** `DATABASE_URL` references `${{Postgres.DATABASE_URL}}`; `GIT_COMMIT` is set by hand after each deploy; Railway sets `PORT`. Secrets for QuickNode and ElevenLabs go in Railway variables, never in Git.
- **Web:** [vercel.json](../vercel.json) builds `shared` then `web` with the pinned pnpm, forwards `/api/*` to the Railway API, and sends every other path to `index.html`. Webhook providers call the Railway URL directly so signatures are checked against the unmodified body.
- [.vercelignore](../.vercelignore) keeps `.env*` files out of CLI uploads; `railway up` already skips everything in `.gitignore`.

On Windows, stop the dev server before `typecheck` or `build`: a running server locks Prisma's engine file and `prisma generate` fails with `EPERM`.
