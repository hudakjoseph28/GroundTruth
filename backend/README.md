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
