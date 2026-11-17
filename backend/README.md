# @groundtruth/backend

Express API: live Ohio parcel search and boundaries (OGRIP), live parcel reports with a FEMA flood check, staged deals, and the QuickNode webhook. Responses use the v1 types from `@groundtruth/shared`.

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

`GET /api/parcels/:parcelKey/report` returns a `ParcelReport`; see [Parcel report](#parcel-report-live-ogrip--fema). The parcel key is URL-encoded, for example `ohio%3A39049%3A010-042534`.

## Parcel search (live Ohio OGRIP)

These routes query Ohio's statewide parcel layer and address locator from the API. They need no database and no credentials. Code: [src/parcels/](src/parcels/).

| Route | Returns |
| --- | --- |
| `GET /api/parcels/search?q=` | `ParcelSearchResult[]`, up to 10. `q` is trimmed and must be 3–120 characters (`400 INVALID_REQUEST` otherwise). `[]` means a valid query with no match. |
| `GET /api/parcels/:parcelKey` | `Parcel` with the published boundary. `404 NOT_FOUND` if OGRIP has no such parcel in that county; `404 NO_COVERAGE` for a county code outside Ohio's 88. |
| `GET /api/coverage` | `Coverage[]`: one row per county in a live count of OGRIP parcels with published IDs (cached 1 hour). `boundarySearchable` means only that the count was above zero at `lastVerifiedAt`, the time of that count. `evidenceKinds` lists the checks a live report can back with a source in that county. Today that is `["flood"]` in the 83 counties where FEMA has an NFHL study, and `[]` in Fayette, Henry, Vinton, Williams, and Wyandot, which have none (measured 2026-11-16; see [FEMA flood check](#fema-flood-check)). It names a check that can run, not a result: a given lot can still come back `unknown`. A row says nothing about report depth. |

**Parcel key rule.** `ohio:<countyFips>:<LocalParcelID exactly as published>`. No punctuation is added or removed, so keys differ by county the way OGRIP does: Franklin publishes `010-042534` (`ohio:39049:010-042534`), Licking publishes `00100000601000` (`ohio:39089:00100000601000`). Published IDs that do not match `[A-Za-z0-9][A-Za-z0-9._-]*`, or are all zeros, get no key.

**Parcel ID search.** A query is a parcel ID when every space-separated part has a digit (`010-042534`, `010042534`, `010 042534`). The typed ID is tried as typed, without separators, and re-punctuated in every separator layout measured in the live layer ([src/parcels/parcelIdFormats.ts](src/parcels/parcelIdFormats.ts), e.g. Franklin's `3-6`), all in one indexed `LocalParcelID IN (...)` query. So `010042534` finds `010-042534`, and `001-000006-01.000` finds `00100000601000`. The statewide form `39049-010-042534` also works. Regenerate the layouts with `pnpm --filter @groundtruth/backend generate:id-formats`.

**Address search.** It needs a house number. It stops at the first step that finds a match:

1. The [OGRIP locator](https://maps.ohio.gov/arcgis/rest/services/OGRIP/Ogrip_locator/GeocodeServer) normalizes the query as typed. The API then searches a 150 m, 500 m, then 1,500 m box around each located point, and keeps only parcels whose **published site address** has the same house number and street name. Locator points are interpolated along street ranges and can land hundreds of meters from the lot (84 W Dodridge St lands about 400 m away), so the point alone never picks a parcel.
2. If that finds nothing, the locator is retried with only house number + street. It rejects some city names it does not hold for a street: `10034 Appleton Rd Johnstown OH` fails, `10034 Appleton Rd` works.
3. If the locator is down or knows no such street, `SitusAddressAll` is matched directly in the counties the typed city lies in, using Census 2020 place and township names ([src/parcels/ohioPlaces.ts](src/parcels/ohioPlaces.ts), regenerated with `generate:places`). This step is slow because the field is not indexed (0.5–40 s per county), so it runs only when a city narrows it to at most three counties. Without a city, a locator outage is reported as `502`.

If a city is typed, every step drops parcels whose published address names a different city: `123 Main St Johnstown OH` returns `[]` and does not offer `123 MAIN ST PATASKALA`. Counties that publish no city (Franklin) are kept when the city lies in that county. Postal cities are not always Census places: OGRIP's Delaware County `7511 DAVIS-KIRK RD PROSPECT` uses the postal city Prospect, while the Census village of Prospect is in Marion County. Steps 1–2 still find it, because the published address names Prospect. Step 3 would search Marion only.

An address naming another state (`…, Washington, DC 20500`) returns `[]` without calling OGRIP.

**Field mapping.**

| `Parcel` field | OGRIP source |
| --- | --- |
| `sourceParcelId` | `LocalParcelID` (only IDs matching `[A-Za-z0-9][A-Za-z0-9._-]*`; placeholders, vacated-road labels, and blanks are skipped) |
| `county`, `countyFips` | `County`, mapped to its Census FIPS code; must agree with the `StateParcelID` prefix (`39049-…`) |
| `siteAddress` | `SitusAddressAll`, with whitespace collapsed |
| `acreage` | `LandArea` when above 0 (it tracks polygon area in acres in every county that fills it) |
| `centroid` | ArcGIS centroid in search results; area-weighted centroid of the boundary on the parcel route |
| `geometry.geojson` | Layer geometry in WGS84; a parcel published as several polygons becomes one `MultiPolygon` |
| `geometry.sourceUrl` | The exact query URL the API fetched |
| `township` | Not published by OGRIP; omitted |

Owner mailing fields (`MailAddressAll`, `MailCity`, …) are never requested, and the response schema drops them if they arrive.

**Failure.** Each OGRIP request has its own limit (`OGRIP_TIMEOUT_MS`, default 8000), and a whole search has twice that. A timeout returns `504 PROVIDER_TIMEOUT`. An unreachable service, HTTP error, ArcGIS error body, or unexpected shape returns `502 INTERNAL_ERROR`. Both are `retryable: true` and never contain partial or guessed parcels.

**Recorded fixtures.** Route tests replay real OGRIP responses from [test/fixtures/ogrip/](test/fixtures/ogrip/) by exact URL, so they never touch the network. After changing a query, re-record from live OGRIP and review the diff:

```bash
pnpm --filter @groundtruth/backend record:ogrip               # every scenario
pnpm --filter @groundtruth/backend record:ogrip franklin-address  # one scenario
```

Scenarios live in [test/fixtures/ogrip/scenarios.ts](test/fixtures/ogrip/scenarios.ts). Those listed in `LOCATOR_DOWN` are recorded with the recorder answering HTTP 503 for the locator (marked `forcedFailure`), so the fallback runs against real parcel-layer responses.

## Parcel report (live OGRIP + FEMA)

`GET /api/parcels/:parcelKey/report` builds a report for any OGRIP parcel. Code: [src/reports/](src/reports/), route in [src/routes/report.ts](src/routes/report.ts).

1. **Stored report in force?** Serve it. A report with no `expiresAt` was seeded or verified by hand (`STAGED-DEMO` now, the golden parcel later). It is always served and never overwritten. A live copy is served until its `expiresAt`.
2. **Otherwise, live.** Load the parcel through the OGRIP adapter (`404 NOT_FOUND` if OGRIP has no such parcel, `404 NO_COVERAGE` for a non-Ohio county code, `504`/`502` on an OGRIP failure). Then run every check at once, each with its own limit ([src/reports/pipeline.ts](src/reports/pipeline.ts)). Once the parcel exists the answer is always `200`. A slow, failed, or crashing check becomes an `unknown` check inside the report.
3. **Cache.** A live report where no check failed for a passing reason is written to PostgreSQL after the response, for 24 hours (`LIVE_REPORT_TTL_MS`). Each source keeps its own `retrievedAt`. A report with a timed-out check is not stored, so the next request asks FEMA again. A database failure never blocks a live report.

**Checks.** The report has eight checks in contract order: `zoning`, `flood`, `access`, `utilities`, `easements`, `sellerAuthority`, `survey`, `septic`. It has no `closing` check, because closing state comes from the deal, not the parcel.

- `flood` runs live against FEMA (below).
- The other seven have no adapter yet. Each is `unknown` from a plain-English template ([src/reports/templates.ts](src/reports/templates.ts)) that names what is missing, the limitation, who resolves it, and the next action. Contact links appear only where checked by hand: Franklin County Planning & Zoning, Recorder, and Public Health (live on 2026-11-16), and the ALTA seller-impersonation handout. Other counties get the office by name and no link.

**Coverage.** `boundaryOnly` when no check has a supporting source, `deep` when every check does, `partial` otherwise. With only flood live, a report is `partial` when FEMA finds a zone and `boundaryOnly` otherwise.

**`biggestOpenQuestion`** ([`biggestOpenQuestion()`](src/reports/pipeline.ts)):

1. A `held` check (a reviewer blocked the closing).
2. Otherwise the first unresolved (`unknown` or `needsReview`) check in this order: `access`, `septic`, `zoning`, `flood`, `utilities`, `easements`, `sellerAuthority`, `survey`, `closing`. Any unresolved question outranks any resolved finding, so an unknown access or septic check beats a found flood zone. Access and wastewater lead because a lot without legal access, or without sewer and a workable septic site, usually cannot be built on at all.
3. Otherwise `flood` if FEMA found a Special Flood Hazard Area.
4. Otherwise the first check in that order.

Until access has an adapter, every live report's answer is `access`.

### FEMA flood check

Service: FEMA National Flood Hazard Layer, `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer`. Layer IDs were read from the live service directory on 2026-11-16:

| Layer | ID | Used for |
| --- | --- | --- |
| Flood Hazard Zones | 28 | `FLD_ZONE`, `ZONE_SUBTY`, `SFHA_TF` |
| FIRM Panels | 3 | Panel number and `EFF_DATE` |
| LOMRs | 1 | Effective Letters of Map Revision and their `EFF_DATE` |
| NFHL Availability | 0 | Whether FEMA has a digital study here (`STUDY_ID`) |

The parcel's OGRIP geometry, with rings re-wound the way Esri reads them, is sent by POST to all four layers at once with `spatialRel=esriSpatialRelRelation&relationParam=T********`. Their interiors must overlap, so a zone that only touches the parcel's edge is not counted. A dropped connection is retried once; FEMA sometimes resets the first connection. The whole check has `FEMA_TIMEOUT_MS` (default 6000).

| Outcome | When | Check |
| --- | --- | --- |
| `found` | One or more mapped zones overlap the parcel | `evidenceFound`. Names each zone and whether any is a Special Flood Hazard Area. A parcel crossing several zones says so, with how many. Sources: the zones layer, each FIRM panel with its effective date, and each effective LOMR with its effective date. |
| `missing` | No mapped zone overlaps, and no study covers it (or FEMA marks it "area not included") | `unknown`, with the two layers queried as dated sources |
| `conflict` | FEMA lists a study but no zone covers the parcel, or a zone's SFHA flag contradicts its letter (A/V must be SFHA, X/D must not) | `unknown`, no zone stated |
| `timeout` | Out of time, HTTP error, ArcGIS error body, or unexpected shape | `unknown`, no sources. Says whether FEMA timed out or could not be reached. |

`effectiveDate` is FEMA's `EFF_DATE`, a calendar date, sent as `YYYY-MM-DD` (`2008-06-17`). Any stored effective date at midnight UTC is served the same way ([`effectiveDateString()`](src/reports/mapReport.ts)), so a seeded report written with calendar dates is served exactly as written. An effective date with any other time keeps the full ISO timestamp.

**NFHL coverage in Ohio, measured 2026-11-16:** 83 of 88 counties have a study. Fayette (39047), Henry (39069), Vinton (39163), Williams (39171), and Wyandot (39175) have none, so every parcel there gets a `missing` flood check.

### Tested parcels (live, 2026-11-17 UTC)

| Parcel | County | Flood result |
| --- | --- | --- |
| `ohio:39049:010-042534`, 84 W Dodridge St | Franklin | Zone X (minimal). Panel 39049C0169K, effective 2008-06-17. LOMRs 13-05-6825P (2014-04-17), 15-05-0192X (2015-05-14), 15-05-3155P (2016-04-20) |
| `ohio:39089:00100000601000`, 10034 Appleton Rd | Licking | Zone X (minimal). Panel 39089C0155J, effective 2015-03-16 |
| `ohio:39049:185-002765`, 0 Groveport Pike | Franklin | Zone AE, regulatory floodway (SFHA) |
| `ohio:39049:152-001927`, 0 Groveport Rd | Franklin | Crosses AE, AE floodway, X 0.2%, X minimal |
| `ohio:39175:010025000000`, 17859 Township Hwy 148 | Wyandot | `missing`: no NFHL study |

### Recorded fixtures

Report tests replay real OGRIP and FEMA responses from [test/fixtures/report/](test/fixtures/report/), matched by method, URL, and POST body, so they never touch the network. After changing a query, re-record and review the diff:

```bash
pnpm --filter @groundtruth/backend record:report                    # every scenario
pnpm --filter @groundtruth/backend record:report franklin-floodway  # one scenario
```

The report recordings include the OGRIP parcel request. A change to the OGRIP query shows up here as an "unrecorded request" until you re-record.

## Deals

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
