# @groundtruth/backend

Express API: live Ohio parcel search and boundaries (OGRIP), live parcel reports with FEMA flood and USDA NRCS soils/septic checks, staged deals, and the QuickNode webhook. Responses use the v1 types from `@groundtruth/shared`.

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

`db:seed` can be run again. It upserts the golden parcel `ohio:39049:230-000918` (Franklin County, Seaman Rd rear lot) from `packages/shared/src/fixtures/golden-parcel.json` and replaces that report's checks and sources. The report is `partial`: access `needsReview`, zoning and flood `evidenceFound` with dated sources, utilities and easements `unknown`. It also upserts the second-county parcel `ohio:39089:00500729609000` (Licking County, 93 Woody Knoll Dr) from `second-county-parcel.json`: coverage `partial`, biggest open question `access`, flood `evidenceFound` (FEMA Zone X), and zoning, access, utilities, easements, seller authority, survey, and septic `unknown`. The seed writes each `unknown` check of a template kind from `templateCheck()` in `src/reports/templates.ts`, the same text a live report uses ([`seededReport()`](src/reports/seededReports.ts)). The one documented override is the Licking zoning check ("GroundTruth doesn't check zoning in Licking County yet."), kept as written in the fixture (`SEEDED_TEMPLATE_OVERRIDES`). The shared JSON fixtures carry the same text for the frontend, and `goldenFixture.test.ts` fails if they drift from the templates. Neither seeded report has a `closing` check, and `biggestOpenQuestion` follows the rule in `src/reports/pipeline.ts`. The seed also deletes the retired stand-in parcel `ohio:39049:STAGED-DEMO` and its report, if present.

`GET /api/health` returns `{ "status": "ok", "commit": "..." }`.

`GET /api/parcels/:parcelKey/report` returns a `ParcelReport`; see [Parcel report](#parcel-report-live-ogrip--fema--usda-ssurgo). The parcel key is URL-encoded, for example `ohio%3A39049%3A230-000918`.

## Parcel search (live Ohio OGRIP)

These routes query Ohio's statewide parcel layer and address locator from the API. They need no database and no credentials. Code: [src/parcels/](src/parcels/).

| Route | Returns |
| --- | --- |
| `GET /api/parcels/search?q=` | `ParcelSearchResult[]`, up to 10. `q` is trimmed and must be 3–120 characters (`400 INVALID_REQUEST` otherwise). `[]` means a valid query with no match. |
| `GET /api/parcels/:parcelKey` | `Parcel` with the published boundary. `404 NOT_FOUND` if OGRIP has no such parcel in that county; `404 NO_COVERAGE` for a county code outside Ohio's 88. |
| `GET /api/coverage` | `Coverage[]`: one row per county in a live count of OGRIP parcels with published IDs (cached 1 hour). `boundarySearchable` means only that the count was above zero at `lastVerifiedAt`, the time of that count. `evidenceKinds` lists checks a live report can back with a source: `septic` in all 88 counties, `flood` in the 83 counties where FEMA has an NFHL study, and `zoning` in Franklin. It names checks that can run, not results: a given lot can still come back `unknown`. A row says nothing about report depth. |

**Parcel key rule.** `ohio:<countyFips>:<LocalParcelID exactly as published>`. No punctuation is added or removed, so keys differ by county the way OGRIP does: Franklin publishes `010-042534` (`ohio:39049:010-042534`), Licking publishes `00100000601000` (`ohio:39089:00100000601000`). Published IDs that do not match `[A-Za-z0-9][A-Za-z0-9._-]*`, or are all zeros, get no key.

**Parcel ID search.** A query is a parcel ID when every space-separated part has a digit (`010-042534`, `010042534`, `010 042534`). The typed ID is tried as typed, without separators, and re-punctuated in every separator layout measured in the live layer ([src/parcels/parcelIdFormats.ts](src/parcels/parcelIdFormats.ts), e.g. Franklin's `3-6`), all in one indexed `LocalParcelID IN (...)` query. So `010042534` finds `010-042534`, and `001-000006-01.000` finds `00100000601000`. The statewide form `39049-010-042534` also works. Regenerate the layouts with `pnpm --filter @groundtruth/backend generate:id-formats`.

**Address search.** With a house number, it stops at the first step that finds a match (a street typed without one is covered below):

1. The [OGRIP locator](https://maps.ohio.gov/arcgis/rest/services/OGRIP/Ogrip_locator/GeocodeServer) normalizes the query as typed. The API then searches a 500 m box around each located point, and a 1,500 m box only if 500 m finds nothing. Each box is **filtered by house number on the server** (`SitusAddressAll LIKE '<number> %'`, plus a pattern for the few site addresses with leading spaces), with `returnGeometry=false` and a centroid, so it returns a handful of rows instead of up to 2,000. It keeps only parcels whose **published site address** has the same house number and street name. Locator points are interpolated along street ranges and can land hundreds of meters from the lot (84 W Dodridge St lands about 400 m away), so the point alone never picks a parcel. The boundary is fetched only by `GET /api/parcels/:parcelKey`.
2. If the locator located nothing, or located a different street than the one typed, the API retries it. First it tries the query with spelled-out directions and suffixes abbreviated, because the locator reads "South" in `37 South High Street` as a street named SOUTH. Then it tries house number + street only, because the locator rejects some city names it does not hold for a street: `10034 Appleton Rd Johnstown OH` fails, `10034 Appleton Rd` works. Once the locator has located the typed street, a miss is final.
3. If the locator is down or knows no such street, `SitusAddressAll` is matched directly in the counties the typed city lies in, using Census 2020 place and township names ([src/parcels/ohioPlaces.ts](src/parcels/ohioPlaces.ts), regenerated with `generate:places`). This step is slow because the field is not indexed (0.5–40 s per county), so it runs only when a city narrows it to at most three counties. Without a city, a locator outage is reported as `502`.

**House number 0.** Counties publish `0` for a lot with no assigned address, such as the golden parcel's `0 SEAMAN RD`. The locator has no point for house number 0: for `0 Seaman Rd` it answers only the Whitehall and Toledo streets. So for `0` the API asks the locator for the street name alone (with the typed city, then without), keeps candidates of type `StreetName` that equal the typed name, and searches the same 500 m / 1,500 m boxes, filtered to `0 <street>`, around each one. `Seaman Rd` locates eight streets statewide, and the Franklin one returns all seven `0 SEAMAN RD` lots, including `230-000918`. One street's box can stall for 8 s while the others answer in 0.3 s (measured 2026-11-18). Lots already found are returned even if another street's box failed. With nothing found and a box failed, the failure is reported, not `[]`.

**Street with no house number.** `Seaman Rd` or `Dodridge St` returns up to ten lots on that street, each with its address. It reuses the house-number-0 path: the locator is asked for the street name alone, and each located street's box is filtered on the server to the street name (`SitusAddressAll LIKE '%SEAMAN%'`, at most 200 rows a box) and then to whole-word matches, so `Seaman Rd` never returns `SEAMANS LN`. A typed direction or suffix must still agree, which keeps `Seaman St` and `Seaman Dr` out of `Seaman Rd`.

- **A name is often several streets.** `Seaman Rd` locates eight statewide. Results are taken from each located street in turn, nearest its located point first, so the first three are one lot each in Adams, Franklin, and Lucas.
- **A typed city** drops lots whose published address names another city. `Seaman Rd, Galloway` drops the Lucas lots (published as Toledo or Oregon). It keeps Adams and Franklin, which publish no city for these lots, because Galloway is a postal city and not in the Census place table.
- **Measured live on 2026-11-18:** `Seaman Rd` 0.9 s over 13 requests, `Dodridge St` 0.2 s over 2.
- **A locator outage is reported as `502`.** There is no direct match to fall back on without a house number.
- **`5th Ave`** is read as a street, not as house number 5.

**A city alone.** `Columbus`, `Johnstown OH 43031`, or `Mt Vernon` (any Census 2020 place or township name with nothing else) answers `400 INVALID_REQUEST` without calling OGRIP: "“Columbus” is a place, not a street. Add a street name or a full address there, or search by parcel ID." The village of Seaman is a place too, so `Seaman` gets that message and `Seaman Rd` gets the street.

**Direction and suffix.** The locator drops street directions (`1739 N High St` and `1739 S High St` both locate as `1739 HIGH`), so the typed text decides:
- A typed direction (`N`, or spelled out as `North`, before or after the name) must equal the published one. `1739 N High St` returns `[]`, because OGRIP publishes only `1739 S HIGH ST`.
- With no direction typed, every direction matches and all are returned: `750 High St, Columbus` returns both `750 N HIGH ST` and `750 S HIGH ST`.
- A typed suffix (`St`, `Street`, `Ave`, `Avenue`, …) must equal the published suffix in USPS form.

**Stalls.** OGRIP sometimes stalls on a single request; the same query answered in 8 s and then in 0.7 s on 2026-11-17. If a request hasn't answered after 2.5 s, one identical copy is sent and whichever answers first is used. This applies only when `OGRIP_TIMEOUT_MS` is more than twice that, as with the 8 s default.

If a city is typed, every step drops parcels whose published address names a different city: `123 Main St Johnstown OH` returns `[]` and does not offer `123 MAIN ST PATASKALA`. Counties that publish no city (Franklin) are kept when the city lies in that county. Postal cities are not always Census places: OGRIP's Delaware County `7511 DAVIS-KIRK RD PROSPECT` uses the postal city Prospect, while the Census village of Prospect is in Marion County. Steps 1–2 still find it, because the published address names Prospect. Step 3 would search Marion only.

An address naming another state (`…, Washington, DC 20500`) returns `[]` without calling OGRIP.

**Field mapping.**

| `Parcel` field | OGRIP source |
| --- | --- |
| `sourceParcelId` | `LocalParcelID` (only IDs matching `[A-Za-z0-9][A-Za-z0-9._-]*`; placeholders, vacated-road labels, and blanks are skipped) |
| `county`, `countyFips` | `County`, mapped to its Census FIPS code; must agree with the `StateParcelID` prefix (`39049-…`) |
| `siteAddress` | `SitusAddressAll`, cleaned for display: one copy of a repeated city and ZIP, title case, single spaces (`10034 APPLETON RD JOHNSTOWN, OH 43031 JOHNSTOWN 43031` becomes `10034 Appleton Rd, Johnstown, OH 43031`). See [Site address](#site-address). |
| `acreage` | `LandArea` when above 0 (it tracks polygon area in acres in every county that fills it) |
| `mappedAcreage` | `Shape__Area` ÷ 43,560, to two decimals. The layer is EPSG:3735 (US survey feet), so this is the boundary's own area in acres. Franklin publishes `LandArea` 0, so search shows this instead, labeled "mapped". A parcel published as several polygons sums its parts on the parcel route; in search, copies that disagree drop it rather than show one part's area. Never a recorded or legal acreage. |
| `centroid` | ArcGIS centroid in search results; area-weighted centroid of the boundary on the parcel route |
| `geometry.geojson` | Layer geometry in WGS84; a parcel published as several polygons becomes one `MultiPolygon` |
| `geometry.sourceUrl` | The exact query URL the API fetched |
| `township` | Not published by OGRIP; omitted |

### Site address

Counties publish `SitusAddressAll` in capitals, padded with spaces, and in several layouts. [src/parcels/siteAddress.ts](src/parcels/siteAddress.ts) turns each into one readable line:

| County | Published | `siteAddress` |
| --- | --- | --- |
| Licking | `10034 APPLETON RD JOHNSTOWN, OH 43031 JOHNSTOWN 43031` | `10034 Appleton Rd, Johnstown, OH 43031` |
| Lucas | `7522  SEAMAN RD  TOLEDO 43616` | `7522 Seaman Rd, Toledo, OH 43616` |
| Vinton | `68475 PRATTSVILLE RD MC ARTHUR 45651` | `68475 Prattsville Rd, Mc Arthur, OH 45651` |
| Franklin | `84 W DODRIDGE ST   ` | `84 W Dodridge St` |
| Wyandot | `310 W  CHURCH                 ST  ` | `310 W Church St` |

- **Nothing is invented.** The only word added is `OH`, before a published ZIP. Franklin publishes no city, so its addresses get none. The only words dropped are a repeated city and ZIP.
- **Where the comma goes.** Between street and city only where the county repeats the city, separates it with a wider gap, or the street ends in a Census 2020 Ohio place name. Otherwise the words stay as published.
- **House number 0 stays** (`0 Seaman Rd`): it is how a county says a lot has no assigned number. A field holding only `0` is no address and is omitted.
- **Search is unaffected.** It matches on the published text before cleaning.
- **The published text is not a field.** `Parcel` in [DataContract](../docs/architecture/DataContract.md) has one `siteAddress`, so the API returns only the cleaned value. The county's own text is in the OGRIP record at the parcel's `geometry.sourceUrl`.

After a change to the cleaning, `pnpm --filter @groundtruth/backend record:ogrip --refresh` re-derives each recording's saved API response from its saved OGRIP responses, with no live call.

Owner mailing fields (`MailAddressAll`, `MailCity`, …) are never requested, and the response schema drops them if they arrive.

**Failure.** Each OGRIP request has its own limit (`OGRIP_TIMEOUT_MS`, default 8000), and a whole search has twice that. A timeout returns `504 PROVIDER_TIMEOUT`. An unreachable service, HTTP error, ArcGIS error body, or unexpected shape returns `502 INTERNAL_ERROR`. Both are `retryable: true` and never contain partial or guessed parcels.

**Recorded fixtures.** Route tests replay real OGRIP responses from [test/fixtures/ogrip/](test/fixtures/ogrip/) by exact URL, so they never touch the network. After changing a query, re-record from live OGRIP and review the diff:

```bash
pnpm --filter @groundtruth/backend record:ogrip               # every scenario
pnpm --filter @groundtruth/backend record:ogrip franklin-address  # one scenario
```

Scenarios live in [test/fixtures/ogrip/scenarios.ts](test/fixtures/ogrip/scenarios.ts). Those listed in `LOCATOR_DOWN` are recorded with the recorder answering HTTP 503 for the locator (marked `forcedFailure`), so the fallback runs against real parcel-layer responses.

## Parcel report (live OGRIP + FEMA + USDA SSURGO)

`GET /api/parcels/:parcelKey/report` builds a report for any OGRIP parcel. Code: [src/reports/](src/reports/), route in [src/routes/report.ts](src/routes/report.ts).

1. **Stored report in force?** Serve it. A report with no `expiresAt` was seeded or verified by hand (the golden parcel `ohio:39049:230-000918` and the second-county parcel `ohio:39089:00500729609000`). It is always served and never overwritten. A live copy is served until its `expiresAt`.
2. **Otherwise, live.** Load the parcel through the OGRIP adapter (`404 NOT_FOUND` if OGRIP has no such parcel, `404 NO_COVERAGE` for a non-Ohio county code, `504`/`502` on an OGRIP failure). Then run every check at once, each with its own limit ([src/reports/pipeline.ts](src/reports/pipeline.ts)). Once the parcel exists the answer is always `200`. A slow, failed, or crashing check becomes an `unknown` check inside the report.
3. **Cache.** A live report where no check failed for a passing reason is written to PostgreSQL after the response, for 24 hours (`LIVE_REPORT_TTL_MS`). Each source keeps its own `retrievedAt`. A report with a timed-out check is not stored, so the next request asks the provider again. A database failure never blocks a live report.

**Checks.** The report has eight checks in contract order: `zoning`, `flood`, `access`, `utilities`, `easements`, `sellerAuthority`, `survey`, `septic`. It has no `closing` check, because closing state comes from the deal, not the parcel.

- `flood` runs live against FEMA (below).
- `septic` runs live against USDA NRCS Soil Data Access for every parcel (below).
- Franklin `zoning` and `access` run against county layers. Checks without an adapter remain `unknown` from a plain-English template ([src/reports/templates.ts](src/reports/templates.ts)) that names what is missing, the limitation, who resolves it, and the next action.

**Coverage.** `boundaryOnly` when no check has a supporting source, `deep` when every check does, `partial` otherwise. A rated SSURGO response is sourced and therefore makes an otherwise template-only report `partial`; a timeout, unavailable response, missing map unit, or unrated map unit remains `unknown`.

**`biggestOpenQuestion`** ([`biggestOpenQuestion()`](src/reports/pipeline.ts)):

1. A `held` check (a reviewer blocked the closing).
2. Otherwise the first unresolved (`unknown` or `needsReview`) check in this order: `access`, `septic`, `zoning`, `flood`, `utilities`, `easements`, `sellerAuthority`, `survey`, `closing`. Any unresolved question outranks any resolved finding, so an unknown access or septic check beats a found flood zone. Access and wastewater lead because a lot without legal access, or without sewer and a workable septic site, usually cannot be built on at all.
3. Otherwise `flood` if FEMA found a Special Flood Hazard Area.
4. Otherwise the first check in that order.

Outside Franklin County, access still uses the unknown template, so it remains the biggest open question ahead of the new septic screening.

### USDA NRCS SSURGO septic screening

Every live parcel report sends the full OGRIP polygon to USDA NRCS [Soil Data Access](https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest). One fixed query intersects `mupolygon` with the parcel, groups overlap area by `mukey`, and joins `mapunit` and `muaggatt.engstafdcd`. That field is SSURGO's published dominant-condition rating for septic-tank absorption fields.

Only the three published screening classes used by the product are accepted: `Very limited`, `Somewhat limited`, and `Not limited`. Each returned map unit includes its share of the parcel, computed from the relative intersection areas. A rated response is always `needsReview`; wording says the interpretation does not establish that an on-site sewage system is feasible. The check cites USDA NRCS Soil Data Access with the response's `retrievedAt`.

No map unit, an unrated/other value, an unexpected response, an HTTP failure, or the check's own 6000 ms timeout becomes `unknown` with no positive or negative conclusion. The timeout runs alongside the flood, zoning, access, and template checks; it cannot hold up another check, and a transient failure is not cached. Every outcome ends with the same next action: use the [Ohio Department of Health homeowner page](https://odh.ohio.gov/know-our-programs/sewage-treatment-systems/information-for-homeowners/) to find the local health district and obtain its site and soil evaluation before planning a septic system.

The seeded golden report is served before providers run and remains unchanged. Tests replay a saved SDA-shaped success response, the real HTTP 502 response recorded from Soil Data Access on 2026-11-18, and a forced timeout. The live endpoint was unavailable during this implementation, so the success fixture is labeled as test data and should be refreshed with `record:report` when USDA is available.

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

### Franklin zoning check

Franklin parcels (`countyFips` 39049) get a live zoning check instead of the zoning template. Every other county keeps the template. Code: [src/reports/franklinZoning.ts](src/reports/franklinZoning.ts) and [src/reports/zoningCheck.ts](src/reports/zoningCheck.ts).

- **Source:** Franklin County Economic Development & Planning's zoning map, [`FCEDP_Zoning_Districts_2025_View`](https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEDP_Zoning_Districts_2025_View/FeatureServer/0), fields `ZONING` and `Zoning_Class`. District names come from the layer's `Zoning_Class` domain.
- **Query:** the parcel's full OGRIP polygon is sent by POST with `spatialRel=esriSpatialRelRelation&relationParam=T********`, so a district that only touches the lot's edge is left out.
  - Named districts come back with their geometry.
  - `NOT IN JURISDICTION` areas are only counted at first. Around Columbus that polygon is the city's whole outline, about 1.4 MB. Its geometry is fetched only when a named district also covers the lot, to measure where the map contradicts itself.
  - The check has its own limit, `ZONING_TIMEOUT_MS` (default 6000), and runs alongside the flood check.
- **Measuring:** each district's share of the lot is measured by testing a 300 × 300 grid of points across the lot's bounding box against the lot and each district (even-odd rule, which handles holes). Exact polygon clipping failed on real data: districts sharing an exact edge make clipping libraries give up. On 7 lots the sampled shares were within 0.02 percentage points of exact areas.
- **Outcomes:** a district counts if it covers at least 1% of the lot; less is a sliver along a shared edge.
  - One district, with less than 1% of the lot outside it: `evidenceFound`, naming the district and citing the layer (retrieved now) and the 2026 Zoning Resolution (as read on 2026-11-17).
  - Two or more districts, 1% or more in no district, or a district the same map also marks `NOT IN JURISDICTION`: `needsReview`, giving each share.
  - No named district (a city, village, or township that does its own zoning, such as Columbus, or `NOT IN JURISDICTION`): `unknown`, naming the local zoning office.
  - Timeout or error: `unknown`. The report is still `200`, and it is not cached.
- **Seeded golden report:** unchanged. The live check on `230-000918` gives the same answer, R on 100% of the lot, and a test holds the two together.
- **Try it live:** `pnpm --filter @groundtruth/backend check:zoning ohio:39049:230-000918 ohio:39049:230-000397`

### Franklin road access check

Franklin parcels get a live access check instead of the access template, from the same two county layers the golden report cites. Code: [src/reports/franklinAccess.ts](src/reports/franklinAccess.ts) and [src/reports/accessCheck.ts](src/reports/accessCheck.ts).

- **Sources:** Franklin County's tax-parcel [right-of-way layer](https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/6) (`TYPE`) and the County Engineer's [road sections](https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEO_Road_Sections_Public/FeatureServer/0) (`MSAG_LSN`, `RoadClass`, `Jurisdiction`).
- **Queries** (POST, parcel polygon, run together):
  - Right-of-way within 1 m of the parcel, public road types only: `Public Right Of Way`, `Plat - R/W`, `Deed - R/W`, `Road Record`, `Prescriptive Right Of Way`, `Court - R/W`, `Highway`. Abandoned (`Historic - R/W`), private ingress-egress, sidewalks, paths, leases, and easements are left out.
  - Road centerlines within 200 m, widened to 1 mile only if none. `Private` and `Ramp` classes are skipped.
- **Measuring:** distances from the parcel boundary to each centerline are computed locally in metres. A road "runs through" a touching right-of-way when its point closest to the parcel lies inside that polygon, within 100 m. The nearest such road is the frontage; another is named only within 25 m of it (a corner lot), because one Columbus right-of-way polygon can cover a whole street grid.
- **Outcomes.** None of them claims legal access:
  - Touches, with a road through it: `evidenceFound`. Names the road(s) and the centerline distance, and names the road authority from `Jurisdiction`. If every such road is in the `Federal Highway System` class (interstates and expressways): `needsReview`, flagged as usually limited-access.
  - Touches, with no road through it: `needsReview`. It may be a paper street or a highway corridor's edge. Gives the nearest road.
  - Does not touch: `needsReview`, with the nearest road and distance, or "no road within about 1.6 km (1 mile)". A road in another county is marked as outside Franklin County.
  - Timeout or error: `unknown`. The report is still `200` and is not cached. Limit: `ACCESS_TIMEOUT_MS` (default 6000).
- **Seeded golden report:** unchanged. Live on `230-000918` the check gives the same answer: no right-of-way touches it, nearest road Seaman Rd about 106 m (the card rounds to 107 m; QA measured 105.75 m). A test holds the two together.
- **Try it live:** `pnpm --filter @groundtruth/backend check:access ohio:39049:230-000918 ohio:39049:010-042534`

| Parcel | Access result (live, 2026-11-18) |
| --- | --- |
| `230-000918`, 0 Seaman Rd (golden) | `needsReview`: no right-of-way touches it; Seaman Rd about 106 m |
| `010-042534`, 84 W Dodridge St | `evidenceFound`: W Dodridge St and Neil Ave; centerline about 9 m |
| `230-000397`, 6948 Harrisburg Pike | `evidenceFound`: Harrisburg Pike; centerline meets the boundary |
| `152-001927`, 0 Groveport Rd | `evidenceFound`: Old Rathmell Ct and Samson Frontage Rd |
| `185-002765`, 0 Groveport Pike | `needsReview`: touches a "Highway" right-of-way with no centerline through it; I-270 about 43 m, flagged limited-access |

### Tested parcels (live, 2026-11-17 UTC)

| Parcel | County | Flood result |
| --- | --- | --- |
| `ohio:39049:010-042534`, 84 W Dodridge St | Franklin | Zone X (minimal). Panel 39049C0169K, effective 2008-06-17. LOMRs 13-05-6825P (2014-04-17), 15-05-0192X (2015-05-14), 15-05-3155P (2016-04-20) |
| `ohio:39089:00100000601000`, 10034 Appleton Rd | Licking | Zone X (minimal). Panel 39089C0155J, effective 2015-03-16 |
| `ohio:39049:185-002765`, 0 Groveport Pike | Franklin | Zone AE, regulatory floodway (SFHA) |
| `ohio:39049:152-001927`, 0 Groveport Rd | Franklin | Crosses AE, AE floodway, X 0.2%, X minimal |
| `ohio:39175:010025000000`, 17859 Township Hwy 148 | Wyandot | `missing`: no NFHL study |

### Recorded fixtures

Report tests replay saved OGRIP, FEMA, Franklin County, and USDA responses from [test/fixtures/report/](test/fixtures/report/) and [test/fixtures/ssurgo/](test/fixtures/ssurgo/), so they never touch the network. After changing a query, re-record and review the diff:

```bash
pnpm --filter @groundtruth/backend record:report                    # every scenario
pnpm --filter @groundtruth/backend record:report franklin-floodway  # one scenario
```

The report recordings include the OGRIP parcel request. A change to the OGRIP query shows up here as an "unrecorded request" until you re-record.

## Land block assets (built on demand)

The parcel page draws the lot as a 3D block of land: aerial imagery on its terrain, from the parcel's padded bounding box (`landRegion` in `@groundtruth/shared`). The golden and Licking parcels have their assets baked into the web app (`frontend/web/public/parcels/`). Every other parcel gets them from the API:

| Route | Returns |
| --- | --- |
| `GET /api/parcels/:parcelKey/land` | `LandMeta` JSON (`@groundtruth/shared`). Its file names are relative to `…/land/`. |
| `GET /api/parcels/:parcelKey/land/imagery.jpg` | Aerial imagery, JPEG, at most 1.4 MB |
| `GET /api/parcels/:parcelKey/land/height.png` | 257×257 grayscale heights: 0 is `minMeters`, 255 is `maxMeters` |

**How it builds** ([src/land/buildLandAssets.ts](src/land/buildLandAssets.ts)):
- The parcel comes from its OGRIP boundary.
- Imagery is USGS NAIP (`exportImage`, 1536 px). If NAIP has nothing usable, the builder falls back to USGS imagery tiles (z16, 1024 px).
- Elevation comes from AWS Terrarium tiles (z15).
- The builder downloads imagery and elevation in parallel. Each upstream request gets 20 s and 2 tries.
- It is the same code `frontend/web/scripts/bake-parcel.ts` runs. Rebuilding the golden parcel with it reproduces its committed `meta.json` exactly (same box, ground size, and elevation range); only `retrievedAt` differs.

**Caching** ([src/land/landAssets.ts](src/land/landAssets.ts)):
- Builds are held in memory (24 parcels) and in PostgreSQL (`LandAssetRecord`) for 30 days, so a restart does not rebuild them.
- Each parcel builds at most once at a time.
- A build runs to completion and is cached even if the browser stopped waiting.
- Responses carry `Cache-Control: public, max-age=86400`.
- A database failure only costs a rebuild.

**Errors**, all retryable except the 404s and the 400:

| Case | Status | Code |
| --- | --- | --- |
| Bad key | 400 | `INVALID_REQUEST` |
| Not an Ohio county | 404 | `NO_COVERAGE` |
| No such parcel, or no drawable boundary | 404 | `NOT_FOUND` |
| OGRIP, imagery, or elevation timeout | 504 | `PROVIDER_TIMEOUT` |
| Other provider failure | 502 | `INTERNAL_ERROR` |

The API never invents a land block.

Measured locally on 2026-11-18 (cold cache, live services):

| Parcel | Build | Imagery |
| --- | --- | --- |
| 84 W Dodridge St (`ohio:39049:010-042534`) | 0.4–1.7 s | NAIP, 51 m square |
| 10034 Appleton Rd (`ohio:39089:00100000601000`) | 0.5–11.7 s | NAIP, 303 m |
| 0 Groveport Pike, 15.2 ac (`ohio:39049:185-002765`) | 13.1 s | NAIP |

NAIP's response time varies the most. The web waits 10 s for a build (`LAND_BUILD_DEADLINE_MS`) and then shows the flat boundary. The next visit is served from the cache.

## Deals

`GET /api/deals/:id` returns a `Deal`, and `GET /api/deals/:id/timeline` returns its `TimelineEvent[]`. Only deals seeded as public demos are readable; any other ID returns `404`.

`db:seed` upserts the staged demo closings from `stagedDemoDeals` in `@groundtruth/shared`. All are on the golden parcel, with the same buyer, seller, and required title/survey/septic reviewers:

| Deal ID | Outcome | Deal PDA (`escrowAddress`) | deal_id = sha256 of |
| --- | --- | --- | --- |
| `staged-devnet-deal` | held: release rejected, buyer refunded | `54Va6qKNQTsbuXTqi4tXaPVgdkQh4S7McsCKsjKPE4tW` | `groundtruth-demo-held-v1` |
| `staged-devnet-deal-released` | released to the seller | `3uBECmkG9XKbJbGisPjqWNxy6Sb3knVZ2cnwF7jby2yu` | `groundtruth-demo-released-v1` |
| `staged-devnet-deal-live` | released live on stage (10 USDC) | `2UrftJMzbvMngu6Mdg4PhFscqkCHnuLksfbSAiddF6Cg` | `groundtruth-demo-live-v1` |
| `staged-devnet-deal-rehearsal` | rehearsal copy of the live deal (10 USDC); used up testing the reviewer portal (#45) | `6KQJYssz234KjxrMkREcxpcKbok34aaFyihDST6DmH5u` | `groundtruth-demo-rehearsal-v1` |
| `staged-devnet-deal-rehearsal-v2` | second rehearsal copy (10 USDC) | `EPYNKVUCSUJvmuKa5NqJqNmswcdziLRJHUgwTkkC8J2X` | `groundtruth-demo-rehearsal-v2` |

The first two are 25 test USDC and ran on 2026-11-18. The addresses are what `pnpm --filter @groundtruth/escrow demo:deals plan` prints for the staged demo wallets, and `test/stagedDemoDeals.test.ts` re-derives each one. Public keys only. Re-seeding rewrites the fixture's bound values and its own off-chain timeline rows only. Deal state, approvals, holds, and confirmed timeline rows come from chain events and are never reset by the seed.

Timeline rows are ordered by time, then chain slot, then event index. A confirmed row is unique by transaction signature + event index, which is the QuickNode replay guard.

## QuickNode Stream webhook

`POST /api/webhooks/quicknode` turns confirmed GroundTruth program events, and rejected payouts, into deal state and timeline rows.

1. **Signature.** QuickNode signs `nonce + timestamp + body` with HMAC-SHA256, keyed by the Stream's security token (`QUICKNODE_STREAM_TOKEN`), and sends hex in `X-QN-Signature` with `X-QN-Nonce` and `X-QN-Timestamp`. The route checks it against the raw decompressed body (gzip deliveries are inflated first). With no token set, every delivery gets `503`.
2. **Payload.** The Stream filter must return exactly this shape, in block order, or `null` to skip a block. There are two kinds of entry:
   - a **successful** transaction that touched the program, directly or by CPI;
   - a **failed** transaction whose failing instruction (the index in `err.InstructionError`) is a top-level GroundTruth `release`, with that instruction's accounts in IDL order.

   ```json
   { "transactions": [
     { "signature": "<base58>", "slot": 123, "blockTime": 1794700800, "logMessages": ["Program log: ..."] },
     { "signature": "<base58>", "slot": 124, "blockTime": 1794700801, "logMessages": ["..."],
       "err": { "InstructionError": [0, { "Custom": 6019 }] },
       "releaseAccounts": ["<payer>", "<deal PDA>", "<seller>", "..."] }
   ] }
   ```

   A failed entry must carry `releaseAccounts` and a successful one must not, or the delivery gets `400`. The filter, [src/routes/quicknodeWebhook.ts](src/routes/quicknodeWebhook.ts) and `quicknodeFilters.test.ts` change together.

3. **Decode.** [src/chain/escrowDecoder.ts](src/chain/escrowDecoder.ts) reads events with the checked-in IDL's own Borsh coder (`@anchor-lang/core` 1.2.2, the client for the program's Anchor 1.2.2).
   - Anchor's `emit!` writes `Program data: <base64>`. Only lines written while the GroundTruth program is running count: the decoder tracks the `Program <id> invoke` / `success` / `failed` stack against `GROUNDTRUTH_PROGRAM_ID`, so another program's logs cannot pass as GroundTruth events.
   - All six events map to the API's shapes. `HoldReason` becomes the contract's codes (`SellerIdentityDisputed` → `SELLER_IDENTITY_DISPUTED`, and so on).
   - An unknown discriminator, data that does not decode exactly (truncated or with extra bytes), an unbalanced invoke stack, or `Log truncated` throws. The whole delivery is decoded before anything is applied, so one unreadable transaction answers `500` and nothing in that delivery is half-applied. QuickNode retries and then pauses the Stream; nothing is lost.
   - **A failed release** emits no event; its logged events, if any, were rolled back and are ignored. It becomes one `ReleaseRejected` with the deal PDA (`releaseAccounts[1]`) and the program's error from its `AnchorError` log line, for example `DealHeld` (6019). If that line is missing, the name comes from the IDL by the `Custom` number. If the logs and `err` disagree, the decoder throws.
4. **Apply.** Each event is matched to a deal by its PDA (`escrowAddress`) and applied in one database transaction: timeline row, reviewer approval or hold, and the deal state change. Events for unknown PDAs are skipped.
   - An event the stored deal cannot accept throws `ChainDriftError` and writes nothing: an approval after a hold, a second release, a payout to someone other than the bound seller, an unbound reviewer, or a different amount.
   - A `ReleaseRejected` writes a `releaseRejected` timeline row with the real signature and the program's error, in any state, and **never changes deal state**.

| Response | Meaning | QuickNode does |
| --- | --- | --- |
| `204` | Applied, or already applied | Moves to the next block |
| `400` | Signed body is not the filter shape | Retries, then pauses: fix the filter |
| `401` | Signature missing or wrong | Retries, then pauses: check the token |
| `500` / `503` | An unreadable transaction (unknown event, malformed data, truncated logs), drift, database error, or no token | Retries, then pauses |

Replays are harmless: a timeline row is unique by transaction signature + event index (a rejected release is index 0 of its transaction), and re-applying finds it and does nothing. The timestamp is not checked against a window. QuickNode does not document its format, and deduplication already makes a replayed delivery a no-op.

**Test data.** Three kinds, kept apart:
- **IDL-encoded** logs built with the IDL's own coder ([test/support/escrowLogs.ts](test/support/escrowLogs.ts)) drive the decoder, filter, webhook, and database tests. They cover all six events, a spoofed log, a held flow (init → fund → hold → rejected release → refund), and a released flow.
- **Recorded devnet data** ([test/fixtures/devnet/program-history.json](test/fixtures/devnet/program-history.json)) holds every transaction that touched the deployed program, plus the program account and its on-chain IDL. `pnpm --filter @groundtruth/backend record:devnet` fetches it from the public RPC (no keys).
  - Re-recorded 2026-11-18, it has the deploy, two IDL uploads, the upgrade, and the **11 transactions of both demo closings**, the held deal's failed release included.
  - [test/devnetRecorded.test.ts](test/devnetRecorded.test.ts) checks that the on-chain IDL is the checked-in one. It also runs each transaction through the real filter, webhook, and decoder against `EXPECTED_SENT`: DealHeld (6019) for the rejected release, and exactly 25 USDC for the refund and the release.
  - [test/fixtures/devnet/demo-run/](test/fixtures/devnet/demo-run/) holds each deal's transactions as `replay:devnet --save` fetched them.
- **Simulated demo closings** (kept alongside the real ones) ([test/fixtures/devnet/demo-deals.simulated.json](test/fixtures/devnet/demo-deals.simulated.json)) are **not devnet data**. They are both staged closings, run by `demo:deals simulate` in LiteSVM on the deployed (upgraded) bytecode for the staged deals' real PDAs, and shaped like `getTransaction` output. They drive the replay tests. The replay tests run on both the recorded devnet run and the simulation.

### Replay from devnet (backup for missed deliveries)

```bash
pnpm --filter @groundtruth/backend replay:devnet --deal staged-devnet-deal
pnpm --filter @groundtruth/backend replay:devnet --deal <id> --dry-run          # print events, write nothing
pnpm --filter @groundtruth/backend replay:devnet --deal <id> --save <file.json> # also keep the fetched transactions
```

The command reads the deal's PDA (`escrowAddress`) from `DATABASE_URL`. It then fetches every finalized transaction that touched that PDA, failed releases included, from the public devnet RPC (or `SOLANA_RPC_URL`), oldest first.

Each transaction is run through `quicknode/groundtruth-filter.js` as its own Block entry, then through the webhook's payload schema and the IDL decoder ([src/chain/streamPayload.ts](src/chain/streamPayload.ts), shared with the route), then applied with `applyConfirmedEvent`. That is the same path a live delivery takes.

Replay is idempotent. Rows are unique by signature + event index, so a second run, or a run after QuickNode already delivered some events, reports them as `duplicate` and changes nothing. [test/devnetReplay.test.ts](test/devnetReplay.test.ts) and [test/db/devnetReplay.db.test.ts](test/db/devnetReplay.db.test.ts) replay the recorded devnet run and the simulated closings, twice each. The database test skips the real run, with a reason, in a database that already holds those events, because rows are unique by signature + index across deals; in CI it fails instead.

### Filters

Filters live in [quicknode/](quicknode/) and are pasted into the Stream's filter editor (wizard step 2, "Stream dataset"). The **Fetch Final Payload** preview on step 3 shows the exact body the webhook will receive. QuickNode sends the filter's return value as-is, with no envelope.

| File | Use |
| --- | --- |
| `heartbeat-filter.js` | `{ "transactions": [] }` for every block. Proves signing and delivery before the program exists. |
| `groundtruth-filter.js` | The real filter. `PROGRAM_ID` is the escrow program deployed to devnet in #22, `ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG` (the same `GROUNDTRUTH_PROGRAM_ID` the decoder uses; `quicknodeFilters.test.ts` checks they match). Sends successful program transactions and failed `release` attempts; `RELEASE_IX_DATA` is the `release` discriminator in base58, checked against the IDL by `quicknodeFilters.test.ts`. |
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

## Deal text alerts (staged demo, Twilio)

Anyone viewing a public staged deal can choose **Text me updates** and enter a mobile number. That deal then sends them a short text for each new confirmed `DealFunded`, `HoldPlaced`, rejected release, or `DealReleased` event, e.g. `GroundTruth: your 10 test USDC escrow was released to the seller. Explorer: https://explorer.solana.com/tx/<signature>?cluster=devnet`. A text reports chain state. It never approves, holds, or moves anything.

- **Opt-in:** `POST /api/deals/:id/sms-subscriptions` with `{ "phoneNumber": "614 555 0123", "consent": true }`. Returns `201` for a new number or `200` for one already on the deal, as `{ dealId, maskedPhoneNumber: "+1 ••• ••• 0123" }`. Answers `400` for a missing consent or an unreadable number, `404` for a non-public deal, `409` for a released or refunded deal or a deal that has reached 25 numbers, and `503` when Twilio is not configured.
- **Privacy:** the number is stored in E.164 form on `SmsSubscriptionRecord` for that deal only and deleted with the deal. It is never mapped into `Deal`, never logged, and never returned unmasked.
- **Send once:** `applyConfirmedEvent` queues one `SmsAlertRecord` per (timeline event, subscriber) in the same transaction as the timeline row. A replayed QuickNode delivery is a duplicate, so it queues nothing new. After the transaction commits, the webhook claims each pending alert (`pending` → `sending`) before sending it, so an alert is sent at most once. If Twilio refuses a text, the alert goes back to `pending` and the next delivery of the same event retries it. After 3 refusals it is marked `failed`. A text failure never fails the webhook or the projection. An opt-in only covers events that arrive after it.
- **Setup:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` (the team's existing Twilio number, `+E.164`) together in Railway variables. They are all-or-none: a partial set stops the API at startup. With none set, opt-ins get `503` and nothing is texted. Never commit them.
- **Tests:** `test/smsAlerts.test.ts` and `test/smsSubscriptions.test.ts` (fake fetch, mocked Prisma), and `test/db/smsAlerts.db.test.ts` (signed deliveries through the real webhook and decoder with a fake sender, including replays and a Twilio refusal). No test sends a real text.

## ElevenLabs owner callback

A staged check against seller impersonation. An ElevenLabs agent phones a **consenting teammate** who plays the owner on record of the golden parcel and asks whether they are selling it. The result becomes **evidence** on the deal timeline for the title reviewer. It never approves, holds, or releases anything; the reviewer's signature and the escrow program decide that. No real parcel owner is ever called.

**Flow**

1. **Trigger, local only.** `pnpm --filter @groundtruth/backend call:owner` prints a dry run; add `--confirm` to dial. It calls `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` with the agent, the imported Twilio number, the callee, and dynamic variables: `deal_id`, `participant_label`, `parcel_id`, `parcel_description`. The API key and phone number stay in `backend/.env`. It never prints the key or the full number.
2. **Agent.** The prompt, first message, and the `sale_answer` data-collection field are in [elevenlabs/owner-callback-agent.md](elevenlabs/owner-callback-agent.md).
3. **Webhook.** `POST /api/webhooks/elevenlabs`:
   - **Signature:** verifies the `ElevenLabs-Signature` header (`t=<unix secs>,v0=<hex>`, HMAC-SHA256 of `"<t>.<raw body>"` with `ELEVENLABS_WEBHOOK_SECRET`). This mirrors the official SDK 2.75.0 `constructEvent`, including its 30-minute limit on old timestamps, with a constant-time compare.
   - **Events:**
     - `post_call_transcription` → `analysis.data_collection_results.sale_answer` becomes *owner denies sale*, *owner confirms sale*, or *unclear*.
     - `call_initiation_failure` → *no answer*.
     - Audio and other event types are acknowledged and never stored.
   - **Storage:** one `OwnerCallRecord` per `conversation_id` (conversation ID, completion time, deal ID, participant label, `call_successful`, outcome) and one `evidenceReceived` timeline row, written in one transaction. **No transcript, audio, or phone number is stored or logged.**
   - **Deals:** only public demo deals accept evidence. Calls with no `deal_id`, an unknown deal, or another agent (when `ELEVENLABS_AGENT_ID` is set) are acknowledged and ignored.

| Response | Meaning | ElevenLabs does |
| --- | --- | --- |
| `200` | Recorded, duplicate, or ignored | Done |
| `400` | Signed body is not a post-call event | No retry |
| `401` | Signature missing, wrong, or older than 30 min | No retry |
| `500` / `503` | Database error, or no secret configured | Retries if retries are enabled on the webhook |

**Setup.** Railway needs `ELEVENLABS_WEBHOOK_SECRET` (from the HMAC webhook created in ElevenLabs settings) and `ELEVENLABS_AGENT_ID`. Local `.env` needs `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `OWNER_CALLBACK_TO_NUMBER`, and `OWNER_CALLBACK_PARTICIPANT_LABEL` (see `.env.example`).

**Test data.** `test/support/elevenlabsPayloads.ts` follows the documented payload and the SDK types. It is not recorded from a live call; replace it once the first real call lands.

## Tests

```bash
pnpm --filter @groundtruth/backend test      # unit and route tests; no database
pnpm --filter @groundtruth/backend test:db   # against DATABASE_URL after db:migrate
```

`test:db` creates and deletes its own `dbtest-*` deals. `devnetReplay.db.test.ts` needs the staged deals' PDAs, so it moves them off the seeded rows while it runs and puts them back afterwards. It never changes those rows' state or timeline, and `db:seed` restores the addresses if a run is interrupted.

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
- **API variables:** `DATABASE_URL` references `${{Postgres.DATABASE_URL}}`; `GIT_COMMIT` is set by hand after each deploy; Railway sets `PORT`. Secrets for QuickNode, ElevenLabs, and Twilio go in Railway variables, never in Git.
- **Web:** [vercel.json](../vercel.json) builds `shared` then `web` with the pinned pnpm, forwards `/api/*` to the Railway API, and sends every other path to `index.html`. Webhook providers call the Railway URL directly so signatures are checked against the unmodified body.
- [.vercelignore](../.vercelignore) keeps `.env*` files out of CLI uploads; `railway up` already skips everything in `.gitignore`.

On Windows, stop the dev server before `typecheck` or `build`: a running server locks Prisma's engine file and `prisma generate` fails with `EPERM`.
