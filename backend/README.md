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
vercel deploy --prod                               # web
```

- **API build:** Railpack runs `pnpm run build`. [railpack.json](../railpack.json) starts the API with `start:prod`, which runs `prisma migrate deploy`, then the compiled seed, then the server. Both are safe to repeat. Do not add `railway.json`: new Railway projects ignore its build, pre-deploy, and healthcheck settings.
- **API variables:** `DATABASE_URL` references `${{Postgres.DATABASE_URL}}`; `GIT_COMMIT` is set by hand after each deploy; Railway sets `PORT`. Secrets for QuickNode and ElevenLabs go in Railway variables, never in Git.
- **Web:** [vercel.json](../vercel.json) builds `shared` then `web` with the pinned pnpm, forwards `/api/*` to the Railway API, and sends every other path to `index.html`. Webhook providers call the Railway URL directly so signatures are checked against the unmodified body.
- [.vercelignore](../.vercelignore) keeps `.env*` files out of CLI uploads; `railway up` already skips everything in `.gitignore`.

On Windows, stop the dev server before `typecheck` or `build`: a running server locks Prisma's engine file and `prisma generate` fails with `EPERM`.
