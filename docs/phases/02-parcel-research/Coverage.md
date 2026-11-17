# Phase 2 · Coverage note

**Recorded Nov 17, 2026, against `main` at `ce33d40`** (PRs #7, #8, #9 via #10); Franklin zoning added the same day. This note covers what GroundTruth searched, what it checked, and where. Each claim comes from a recorded live response or a hand-verified fixture in this repository. It measures **search coverage** and **report depth** separately, as [ParcelResearch.md](ParcelResearch.md#demo-scope) asks.

## Summary

| Measure | Result |
| --- | --- |
| Counties with searchable OGRIP boundaries | **88 of 88**, by a live count of parcels with published IDs (`GET /api/coverage`) |
| Counties tested end to end (search → boundary → report) | **2:** Franklin (39049) and Licking (39089) |
| Counties where the flood check can return evidence | **83 of 88**, the counties with a FEMA NFHL study |
| Counties where the zoning check can return evidence | **1 of 88:** Franklin, live from the county's zoning map, for lots in the townships under county zoning (added Nov 17, 2026) |
| Checks with sourced evidence beyond flood and Franklin zoning | **Golden parcel only:** access, seeded and verified by hand |
| Every other check, every other parcel | `unknown`, with a named responsible party and next action |

## Canonical parcels

| Role | Parcel key | Where | Report | Fixture |
| --- | --- | --- | --- | --- |
| **Golden parcel** | `ohio:39049:230-000918` | Franklin County, Pleasant Township, Seaman Rd rear lot. Vacant agricultural land. | Seeded, `partial`. Access `needsReview`, zoning and flood `evidenceFound`, utilities and easements `unknown`. Biggest open question: access. | `packages/shared/src/fixtures/golden-parcel.json` |
| **Second-county parcel** | `ohio:39089:00500729609000` | Licking County, Bowling Green Township, 93 Woody Knoll Dr. Vacant residential land, 1.2 ac. | Seeded, `partial`. Flood `evidenceFound`; zoning, access, utilities, easements, seller authority, survey and septic `unknown`. Biggest open question: access. | `packages/shared/src/fixtures/second-county-parcel.json` |

Stage search: type `230-000918`. `230000918` and `seaman` also find it in the web catalog.

## Test parcels

These are recorded live responses, replayed by exact request in `backend/test`. Every parcel came from a live lookup; none is invented.

| Parcel key | County | Used for |
| --- | --- | --- |
| `ohio:39049:010-042534` | Franklin | Address search (`84 W Dodridge St, Columbus, OH 43202`), parcel-ID search with and without punctuation (`010-042534`, `010042534`, `010 042534`), boundary, Zone X flood report with three LOMRs |
| `ohio:39089:00100000601000` | Licking | Address search with and without ZIP (`10034 Appleton Rd Johnstown 43031`, `… Johnstown OH`, `…, Johnstown`), auditor-format ID (`001-000006-01.000`), boundary, Zone X flood report |
| `ohio:39089:05317758800000` | Licking | Address without ZIP (`57 S Main St Johnstown OH`). Site-address fallback with the locator forced down (`57 S Main St, Johnstown`). |
| `ohio:39049:185-002765` | Franklin | Flood: only the AE regulatory floodway (Special Flood Hazard Area) |
| `ohio:39049:152-001927` | Franklin | Flood: one lot crossing four zones (AE, AE floodway, X 0.2%, X minimal) |
| `ohio:39049:230-000918` | Franklin | Live flood report on the golden parcel, recorded to compare with the seeded one (two FIRM panels) |
| `ohio:39175:010025000000` | Wyandot | Flood `unknown`: Wyandot County has no NFHL study |
| `ohio:39049:999-999999` | Franklin | Well-formed key that OGRIP does not publish: `404 NOT_FOUND` |

Address queries with no match return `[]` and are also recorded:
- `123 Main St Johnstown OH`: the street exists in Johnstown, but there is no parcel 123 on it.
- `1600 Pennsylvania Ave NW, Washington, DC 20500`: out of state, so OGRIP isn't called.
- `ZZ-404-000404`: a parcel ID that doesn't exist.

## Where each check returns usable evidence

| Check | Where it returns evidence | Elsewhere |
| --- | --- | --- |
| **Boundary** (`Parcel.geometry`) | All 88 counties, live from OGRIP, with `sourceUrl` and `retrievedAt` | `404` when OGRIP has no parcel for the key |
| **Flood** | **Live in 83 counties.** Any OGRIP parcel in a county with a FEMA NFHL study gets zones, FIRM panels and effective LOMRs with effective dates | `unknown` in the 5 counties without an NFHL study, or when FEMA times out or fails |
| **Zoning** | **Live in Franklin County.** The parcel's full OGRIP polygon is intersected with Franklin County's zoning map (`FCEDP_Zoning_Districts_2025_View`). One district covering the lot gives `evidenceFound`, naming the district and citing the layer and the 2026 Zoning Resolution. Two or more districts, or a meaningful part outside the map, give `needsReview`. **Golden parcel:** seeded and verified by hand; the live check gives the same result, R on 100%. | Franklin lots the county map doesn't cover (in a city, village, or township with its own zoning, such as Columbus): `unknown`, naming the local zoning office. Timeout or error: `unknown`, report still `200`. Other counties: `unknown` from the per-kind template. The Licking parcel keeps one documented override sentence: "GroundTruth doesn't check zoning in Licking County yet." |
| **Access** | **Golden parcel only:** seeded `needsReview` (county right-of-way and road layers, Zoning Resolution 2026 §302.042 and §302.0391). It never says "no access". | `unknown` from the template |
| Utilities, easements, seller authority, survey, septic | Nowhere yet | `unknown` from the template, each with its own responsible party and next action |
| Closing | Comes from the staged deal, not the report | Seeded reports have no closing check |

`GET /api/coverage` matches this table: `evidenceKinds: ["zoning", "flood"]` for Franklin, `["flood"]` for the other 82 counties with an NFHL study, and `[]` for the five without one.

### Franklin zoning, live results (Nov 17, 2026)

| Parcel | Where | Zoning check |
| --- | --- | --- |
| `ohio:39049:230-000918` (golden) | Pleasant Twp, Seaman Rd rear lot | `evidenceFound`: "places the whole parcel in the Rural District (R)", the same as the seeded report |
| `ohio:39049:230-000397` | Pleasant Twp, 6948 Harrisburg Pike | `needsReview`: about 53% Rural (R) and about 47% Neighborhood Commercial (NC) |
| `ohio:39049:010-042534` | Columbus, 84 W Dodridge St | `unknown`: the county map doesn't cover it; the local zoning office decides |
| `ohio:39049:230-001361` | Pleasant Twp, Gardner Rd rear | `needsReview`: about 92% Rural (R); about 8.1% is in no county district |
| `ohio:39049:010-253318` | Columbus, 1170 Kinnear Rd | `needsReview`: about 83% EU and 6.3% LI, and the same map marks about 83% as not in county jurisdiction |

The county map overlaps itself in places and leaves gaps, as the last two rows show, so the check reports those plainly instead of picking one answer.

## Sources and retrieval times

The exact query URLs are stored in each fixture's `sourceUrl` / `sources[].url`.

### Statewide

| Source | URL | Retrieved |
| --- | --- | --- |
| Ohio OGRIP statewide parcels | <https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0> | Golden boundary 2026-11-17T00:54:44Z. Licking boundary 2026-11-17T01:07:51Z. Search and boundary test recordings 2026-11-17T00:11:53Z–00:12:00Z. County count for `/api/coverage` 2026-11-17T00:11:55Z. |
| OGRIP address locator (LBRS) | <https://maps.ohio.gov/arcgis/rest/services/OGRIP/Ogrip_locator/GeocodeServer> | Address test recordings, 2026-11-17T00:11:53Z–00:12:00Z |
| FEMA National Flood Hazard Layer | <https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer> (zones 28, FIRM panels 3, LOMRs 1, study availability 0) | Ohio study availability 2026-11-17T01:19:09Z. Flood report recordings 2026-11-17T01:19:09Z–01:23:04Z. |

### Golden parcel `ohio:39049:230-000918`

| Check | Source | Retrieved | Effective |
| --- | --- | --- | --- |
| Access | Franklin County tax parcel right-of-way layer, <https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/6> | 2026-11-17T00:54:49Z | |
| Access | Franklin County Engineer road sections, <https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEO_Road_Sections_Public/FeatureServer/0> | 2026-11-17T00:54:49Z | |
| Access, zoning | Franklin County Zoning Resolution 2026, <https://www.franklincountyohio.gov/files/assets/public/v/1/edp/documents/zoning-resolution/zoning-resolution-2026.pdf> (§302.021, §302.0391, §302.041, §302.042) | 2026-11-17T00:54:52Z | |
| Zoning | FCEDP Zoning Districts 2025, <https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEDP_Zoning_Districts_2025_View/FeatureServer/0> | 2026-11-17T00:54:44Z | |
| Zoning | Franklin County Auditor, parcel 230-000918-00 (3.015 legal acres), <https://audr-apps.franklincountyohio.gov/redir/Link/Parcel/230-000918> | 2026-11-17T00:51:18Z | |
| Zoning | Franklin County stream buffers (Big Darby), <https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/Franklin_County_Stream_Buffers/FeatureServer/0> | 2026-11-17T00:54:49Z | |
| Zoning | Franklin County Planning & Zoning (townships under county zoning), <https://www.franklincountyohio.gov/Business-Development/Development-Planning/Planning-Zoning> | 2026-11-17T00:54:52Z | |
| Flood | FEMA NFHL flood hazard zones (Zone X) | 2026-11-17T00:54:50Z | 2008-06-17 |
| Flood | FEMA FIRM panel 39049C0290K (Franklin; the zone comes from this panel) | 2026-11-17T01:21:55Z | 2008-06-17 |
| Flood | FEMA FIRM panel 39097C0190E (Madison; also covers this location) | 2026-11-17T01:21:56Z | 2023-11-16 |

### Second-county parcel `ohio:39089:00500729609000`

| Check | Source | Retrieved | Effective |
| --- | --- | --- | --- |
| Flood | FEMA NFHL flood hazard zones (Zone X) | 2026-11-17T01:07:51Z | 2015-03-16 |
| Flood | FEMA FIRM panel 39089C0505J (Licking; the zone comes from this panel) | 2026-11-17T01:21:56Z | 2015-03-16 |
| Flood | FEMA FIRM panel 39127C0050D (Perry; also covers this location) | 2026-11-17T01:21:56Z | 2011-04-18 |

The zoning check cites no Licking County source, because GroundTruth runs no Licking zoning check. Its responsible party links to the Bowling Green Township zoning page as a contact, not as evidence: <https://bowlinggreentwp.org/home/index.php/zoning>.

## Forced timeouts

Run on `main` at `ce33d40` with `vitest run test/report.test.ts test/parcels.test.ts -t "timeout|time out|times out|budget"`. Result: **7 passed**.

- **FEMA times out** (FEMA forced to hang, flood limit 200 ms) on `ohio:39049:010-042534`:
  - The report still returns **`200`** within 2 s.
  - Flood becomes `unknown`: "FEMA's flood map service did not answer within 0.2 seconds, so no flood zone was checked."
  - Every other check is unchanged and coverage drops to `boundaryOnly`.
  - The timed-out report is **not cached**, so the next request asks FEMA again.
- **OGRIP times out on the report route:** `504 PROVIDER_TIMEOUT`, `retryable: true`, with no guessed report.
- **OGRIP times out on parcel-ID search, address search, the parcel route and `/api/coverage`:** each returns `504 PROVIDER_TIMEOUT`, `retryable: true`, with no partial result.
- **An address search whose individual requests fit the per-request limit, but together exceed the search budget:** `504 PROVIDER_TIMEOUT`.

## Known limits

- **House number required.** Address search needs a leading house number; a street name alone returns `[]`. Vacant lots without a number are found by parcel ID.
- **OGRIP publishes 0 acreage for Franklin.** `LandArea` is 0 for Franklin parcels, so `Parcel.acreage` is omitted there. The golden parcel's 3.015 legal acres come from the Franklin County Auditor and are cited only inside its zoning check.
- **5 counties have no NFHL data.** Fayette (39047), Henry (39069), Vinton (39163), Williams (39171) and Wyandot (39175) have no FEMA NFHL study, so flood is always `unknown` there.
- **The web search isn't on the live API yet.** `frontend/web/src/data/parcelSource.ts` searches the two canonical parcels only; `GET /api/parcels/search` is live, but the web doesn't call it yet.
- **Address fallback scope.**
  - When the OGRIP locator is down or doesn't know the street, the fallback matches `SitusAddressAll` only when the typed city lies in at most 3 counties (Census 2020 place names).
  - A postal city can point that fallback at the wrong county. Delaware County addresses use the postal city Prospect, but the Census village of Prospect is in Marion County, so the fallback would search Marion only. The locator steps still find those addresses.
  - A dense search box that hits OGRIP's 2,000-record limit without a match returns `[]` rather than widening.
- **Zoning is live in Franklin County only,** and only for lots under county zoning. It names the district; it does not say what can be built there. District shares are measured by testing a 300 × 300 grid of points across the lot; on 7 lots they matched exact areas to within 0.02 percentage points.
- **Hand-verified access is one parcel.** Access evidence exists only for the golden parcel. A live access check against the county right-of-way layer is a later task.
