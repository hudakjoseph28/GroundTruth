# Phase 2 · Coverage note

**Recorded Nov 17–19, 2026, against `main`**; the environmental check (NWI wetlands everywhere plus Franklin stream setbacks) and statewide USDA NRCS soils coverage were added Nov 18, and the Living Atlas SSURGO fallback Nov 19. Also on Nov 19, a flood check that finds a Special Flood Hazard Area or a regulatory floodway became `needsReview`, and a floodway became the biggest open question (see [Flood status and the biggest open question](#flood-status-and-the-biggest-open-question)). Also on Nov 19, a live water and sewer check fills the `utilities` kind (see [Water and sewer](#water-and-sewer-live-results-nov-19-2026)). This note covers what GroundTruth searched, what it checked, and where. Each claim comes from a recorded live response, a provider-contract fixture, or a hand-verified fixture in this repository. It measures **search coverage** and **report depth** separately, as [ParcelResearch.md](ParcelResearch.md#demo-scope) asks.

## Summary

| Measure | Result |
| --- | --- |
| Counties with searchable OGRIP boundaries | **88 of 88**, by a live count of parcels with published IDs (`GET /api/coverage`) |
| Counties tested end to end (search → boundary → report) | **2:** Franklin (39049) and Licking (39089) |
| Counties where the flood check can return evidence | **83 of 88**, the counties with a FEMA NFHL study |
| Counties where the zoning check can return evidence | **1 of 88:** Franklin, live from the county's zoning map, for lots in the townships under county zoning (added Nov 17, 2026) |
| Counties where the environmental check can return evidence | **88 of 88:** NWI wetlands, live. NWI's mapping-status layer is `Digital` everywhere it touches Ohio (recorded Nov 18, 2026). Franklin lots also get the county's riparian stream setbacks. |
| Counties where the septic check can return evidence | **88 of 88:** live USDA NRCS Soil Data Access (SSURGO) map units and the published septic-tank absorption field dominant-condition rating, with the Esri Living Atlas copy of SSURGO as the fallback when SDA fails |
| Counties where the water and sewer (`utilities`) check can return evidence | **88 of 88:** US EPA's community water system and wastewater sewershed maps, live. Franklin lots also get Franklin County Sanitary Engineering's service areas, and lots in or near **Dublin, Grove City, and Canal Winchester** get the distance to the nearest public water and sewer main from each city's own map. Columbus publishes no main map. |
| Other checks with sourced evidence | Franklin access is live; the golden access result is also seeded and verified by hand |
| Easements, seller authority, and survey | `unknown`, with a named responsible party and next action |

## Canonical parcels

| Role | Parcel key | Where | Report | Fixture |
| --- | --- | --- | --- | --- |
| **Golden parcel** | `ohio:39049:230-000918` | Franklin County, Pleasant Township, Seaman Rd rear lot. Vacant agricultural land. | Seeded, `partial`. Access `needsReview`, zoning and flood `evidenceFound`, septic `needsReview` (SSURGO, all three map units “Very limited”; see [QA-Proof](../04-pitch/QA-Proof.md)), utilities and easements `unknown`. Biggest open question: access. | `packages/shared/src/fixtures/golden-parcel.json` |
| **Second-county parcel** | `ohio:39089:00500729609000` | Licking County, Bowling Green Township, 93 Woody Knoll Dr. Vacant residential land, 1.2 ac. | Seeded, `partial`. Flood `evidenceFound`; zoning, access, utilities, easements, seller authority, survey and septic `unknown`. Biggest open question: access. | `packages/shared/src/fixtures/second-county-parcel.json` |

Stage search: type `230-000918`. `230000918` and `seaman` also find it in the web catalog.

## Test parcels

These are recorded live responses, replayed by exact request in `backend/test`. Every parcel came from a live lookup; none is invented.

| Parcel key | County | Used for |
| --- | --- | --- |
| `ohio:39049:010-042534` | Franklin | Address search (`84 W Dodridge St, Columbus, OH 43202`), parcel-ID search with and without punctuation (`010-042534`, `010042534`, `010 042534`), boundary, Zone X flood report with three LOMRs |
| `ohio:39089:00100000601000` | Licking | Address search with and without ZIP (`10034 Appleton Rd Johnstown 43031`, `… Johnstown OH`, `…, Johnstown`), auditor-format ID (`001-000006-01.000`), boundary, Zone X flood report |
| `ohio:39089:05317758800000` | Licking | Address without ZIP (`57 S Main St Johnstown OH`). Site-address fallback with the locator forced down (`57 S Main St, Johnstown`). |
| `ohio:39049:185-002765` | Franklin | Flood `needsReview`: only the AE regulatory floodway (Special Flood Hazard Area). Biggest open question: flood. |
| `ohio:39049:152-001927` | Franklin | Flood `needsReview`: one lot crossing four zones (AE, AE floodway, X 0.2%, X minimal). Biggest open question: flood. |
| `ohio:39049:230-000918` | Franklin | Live flood report on the golden parcel, recorded to compare with the seeded one (two FIRM panels) |
| `ohio:39175:010025000000` | Wyandot | Flood `unknown`: Wyandot County has no NFHL study |
| `ohio:39049:230-002100` | Franklin | Environmental `needsReview`: NWI riverine, emergent wetland, and pond on the lot, and the Big Darby setback on about 41%. Flood `needsReview` too (the same four zones, AE floodway included), so the biggest open question is flood. |
| `ohio:39089:04011612400001` | Licking | Environmental `needsReview`: NWI forested wetland (PFO1A) on about 31% of 8391 Cooper Rd |
| `ohio:39049:040-002918` | Franklin | Water and sewer `evidenceFound`: 2534 Dartmoor Rd, Grove City, inside the Columbus Public Water System's area with Grove City water and gravity sewer mains along the lot line (`backend/test/fixtures/utilities/`) |
| `ohio:39049:999-999999` | Franklin | Well-formed key that OGRIP does not publish: `404 NOT_FOUND` |

Address queries with no match return `[]` and are also recorded:
- `123 Main St Johnstown OH`: the street exists in Johnstown, but there is no parcel 123 on it.
- `1600 Pennsylvania Ave NW, Washington, DC 20500`: out of state, so OGRIP isn't called.
- `ZZ-404-000404`: a parcel ID that doesn't exist.

## Where each check returns usable evidence

| Check | Where it returns evidence | Elsewhere |
| --- | --- | --- |
| **Boundary** (`Parcel.geometry`) | All 88 counties, live from OGRIP, with `sourceUrl` and `retrievedAt` | `404` when OGRIP has no parcel for the key |
| **Flood** | **Live in 83 counties.** Any OGRIP parcel in a county with a FEMA NFHL study gets zones, FIRM panels and effective LOMRs with effective dates. Any part of the lot in a Special Flood Hazard Area (Zone A, AE, AO, AH, V, VE) or a regulatory floodway: `needsReview`, with the floodplain administrator responsible. Zone X only: `evidenceFound`. | `unknown` in the 5 counties without an NFHL study, or when FEMA times out or fails |
| **Zoning** | **Live in Franklin County.** The parcel's full OGRIP polygon is intersected with Franklin County's zoning map (`FCEDP_Zoning_Districts_2025_View`). One district covering the lot gives `evidenceFound`, naming the district and citing the layer and the 2026 Zoning Resolution. Two or more districts, or a meaningful part outside the map, give `needsReview`. **Golden parcel:** seeded and verified by hand; the live check gives the same result, R on 100%. | Franklin lots the county map doesn't cover (in a city, village, or township with its own zoning, such as Columbus): `unknown`, naming the local zoning office. Timeout or error: `unknown`, report still `200`. Other counties: `unknown` from the per-kind template. The Licking parcel keeps one documented override sentence: "GroundTruth doesn't check zoning in Licking County yet." |
| **Access** | **Golden parcel only:** seeded `needsReview` (county right-of-way and road layers, Zoning Resolution 2026 §302.042 and §302.0391). It never says "no access". | `unknown` from the template |
| **Environmental** (wetlands and stream setbacks) | **Live in all 88 counties** for wetlands: the parcel is checked against the National Wetlands Inventory, and types and approximate shares are measured on NWI's own drawing of the lot. **Franklin lots** also get the share inside a riparian setback from the county's Stream Buffers layer, the layer the golden report cites. Either found: `needsReview`. Both answered with nothing on the lot: `evidenceFound`, stating that "NWI shows none" is not a delineation. **Golden parcel:** the seeded report is unchanged and has no environmental check. Live, it gives no NWI wetland and the Big Darby setback on about 4.7%, matching QA-Proof's 4.661%. | Either source timing out (each has its own limit) or failing: that part is `unknown`, and the check can't be `evidenceFound`. NWI with no mapping for a lot: `unknown`, never "none". Without an NWI client: `unknown` from the template, naming the county soil and water conservation district or a wetland consultant. |
| **Septic** | **Live statewide.** The full parcel polygon is sent to USDA NRCS Soil Data Access (3 s budget). If SDA fails or uses its budget, the parcel's bounding box is sent to Esri's ArcGIS Living Atlas "USA Soils Map Units" layer (USDA gSSURGO copy) and the overlap is measured locally. Either way, SSURGO map units are intersected with the parcel and returned with area share and the published `muaggatt.engstafdcd` dominant-condition rating: `Very limited`, `Somewhat limited`, or `Not limited`. The source that answered is cited with `retrievedAt`. A rated response is always `needsReview`, never a site-feasibility conclusion. | No map unit, an unrated/other value, timeout, provider error, or malformed response is `unknown`. Every outcome ends by directing the buyer to the Ohio Department of Health homeowner page, their local health district, and a site and soil evaluation. |
| **Water and sewer** (`utilities`) | **Live in all 88 counties.** The parcel polygon is intersected with US EPA's Community Water System Service Area Boundaries and EPA's sewersheds of publicly owned treatment works; the sewershed's utility comes from the plant's endpoint record. Franklin lots are also intersected with Franklin County Sanitary Engineering's 46 service areas. Where a city main map reaches within 500 m of the lot (Dublin, Grove City, Canal Winchester), the nearest active public main, and for sewer only gravity mains, is measured from the lot boundary. `evidenceFound` only when the lot is inside a mapped water service area **and** a public sewer main is within 30 m. Otherwise `needsReview`. When every sewer source answered and none reaches the lot, the finding ends "No public sewer is mapped for this lot, so it likely needs a septic system" (or "a private well and a septic system"), and the web's bottom line adds the septic soils rating. The limitation always says the maps don't guarantee capacity, a tap permit, or the cost. The next action names the utility to ask for a water/sewer availability letter and tap fees. **Golden parcel:** the seeded report is unchanged and keeps the `unknown` template; see below for the live answer, verified by hand. | No source answering (each has its own 6 s limit; the whole check has 8 s): `unknown`, naming Franklin County Sanitary Engineering in Franklin, or the county sanitary engineer or nearest utility elsewhere. One source failing leaves the others' answers in a `needsReview` check, and the report is not cached. Without a utilities client: `unknown` from the template. |
| Easements, seller authority, survey | Nowhere yet | `unknown` from the template, each with its own responsible party and next action |
| Closing | Comes from the staged deal, not the report | Seeded reports have no closing check |

`GET /api/coverage` matches this table: `evidenceKinds: ["zoning", "flood", "environmental", "utilities", "septic"]` for Franklin, `["flood", "environmental", "utilities", "septic"]` for the other 82 counties with an NFHL study, and `["environmental", "utilities", "septic"]` for the five without one.

### Flood status and the biggest open question

Changed Nov 19, 2026. The sourced finding (zone names, FIRM panels and their effective dates, LOMRs) is unchanged; only the status, next action, responsible party, and ranking moved.

| Flood finding | Status | Next action | Rank as an open question |
| --- | --- | --- | --- |
| Any part of the lot in a regulatory floodway | `needsReview` | "Ask the local floodplain administrator whether a floodplain development permit is needed, and get a flood insurance quote before you commit." | First, ahead of every other open question. Only a reviewer's hold outranks it. |
| Any part in another Special Flood Hazard Area (A, AE, AO, AH, V, VE) | `needsReview` | The same | Right after access, ahead of septic |
| Zone X only (minimal, or 0.2% annual chance) | `evidenceFound` | Check FEMA's Map Service Center before closing | Unchanged: after every open question |

Recorded parcels, replayed in `backend/test/report.test.ts`:

| Parcel | Flood | Biggest open question, before → after |
| --- | --- | --- |
| `ohio:39049:185-002765`, 0 Groveport Pike | Only Zone AE (regulatory floodway). Panels 39049C0431K (2008-06-17) and 39129C0075J (2010-07-22). | access → **flood** |
| `ohio:39049:152-001927`, 0 Groveport Rd | Zone AE, AE floodway, X 0.2%, X minimal. Same two panels. | septic → **flood** |
| `ohio:39049:230-002100`, 0 Harrisburg Georgesville Rd | The same four zones. Panels 39049C0290K and 39097C0190E. | septic → **flood** |
| `ohio:39049:230-000918` (golden) | Zone X (minimal). Seeded and live reports unchanged. | access → access |

GroundTruth does not measure how much of a lot lies in each flood zone, so a sliver of floodway along one edge ranks the same as a lot entirely in it. The finding says so in its limitation.

### Water and sewer, live results (Nov 19, 2026)

Recorded live at 2026-11-20T00:15:58Z–00:16:01Z (Nov 19, 7:16 p.m. ET) by `pnpm --filter @groundtruth/backend record:utilities` into `backend/test/fixtures/utilities/`, and replayed by exact request in `backend/test/utilities.test.ts` and `backend/test/report.test.ts`.

| Parcel | Water | Sewer | Status | Next action names |
| --- | --- | --- | --- | --- |
| `ohio:39049:230-000918` (golden), Seaman Rd rear lot | Not inside any EPA community water system | Not inside any EPA sewershed or Franklin County Sanitary Engineering service area. No main map covers the area. | `needsReview`: "No public water or sewer is mapped for this lot, so it likely needs a private well and a septic system." | Franklin County Sanitary Engineering, then Franklin County Public Health for well and septic permits |
| `ohio:39049:010-042534`, 84 W Dodridge St, Columbus | Inside the Columbus Public Water System (EPA, system-sourced boundary) | Inside the Columbus Jackson Pike WWTP & Sewers sewershed (EPA, sourced from Ohio data) | `needsReview`: Columbus publishes no main map, so no distance to a main | The Columbus Public Water System and the Columbus Division of Sewerage and Drainage (EPA's name for the sewer utility) |
| `ohio:39089:00500729609000` (Licking), 93 Woody Knoll Dr | Not inside any EPA community water system | Not inside any EPA sewershed. No county or city sewer source for Licking. | `needsReview`: private well and septic system likely | The county sanitary engineer or the nearest water and sewer utility, then the local health district |
| `ohio:39049:040-002918`, 2534 Dartmoor Rd, Grove City | Inside the Columbus Public Water System; a Grove City water main runs along the lot line (0.3 m) | Inside the Columbus Southerly WWTP & Sewers sewershed; a Grove City gravity sewer main runs along the lot line (0 m) | `evidenceFound` | The City of Grove City |

**The golden parcel's live answer, verified by hand (Nov 19, 2026).** The seeded report is unchanged: its `utilities` check is still the `unknown` template. The live answer is not a near miss. Measured from the lot's boundary on the same day:
- The nearest EPA community water system boundary is about 5.2 km away (West Jefferson Village PWS, a modeled boundary); the Columbus Public Water System's is about 6.3 km.
- The nearest EPA sewershed is about 4.5 km away (Franklin Co Darbydale Area WWTP & Sewers, modeled); the nearest Franklin County Sanitary Engineering service area, Darbydale, is about 5.8 km away.
- An independent source agrees: the county's Big Darby Accord planning data (`Big_Darby_Accord_View_Only`, layers 43 `T2009_Skeleton_Mains`, 46 `Sanitary_Mains`, 82 `Sewer_Service_Areas`) has no sanitary main and no skeleton water main within 5 km of the lot, and its nearest sewer service area is Darbydale, about 5.8 km away. That data dates from the 2006–2009 Accord plan, so it is a cross-check only, not a source the check reads.

Whether to seed this answer into the golden report is the maintainer's call.

**84 W Dodridge St, cross-checked.** Columbus's lead service line inventory (`ServiceLine_viewing_…/FeatureServer/0` in the City of Columbus ArcGIS Online organization) lists a water service line at `84 W DODRIDGE ST`, which agrees with the EPA water area. The check doesn't read that layer: it is an address inventory, not a main map.

**Sources tried for this check (Nov 19, 2026).**

| Source | Result | Used? |
| --- | --- | --- |
| US EPA Community Water System Service Area Boundaries, `Water_System_Boundaries/FeatureServer/0` | Answers; 44,615 systems nationwide, 1,078 with Ohio primacy | **Yes** |
| US EPA sewersheds of POTWs, `National_Sewershed_Web_Map_Internal_WFL1/FeatureServer/0` (polygons) and `/1` (plant endpoints, for `Authority_Name`) | Answers | **Yes** |
| Franklin County Sanitary Engineering, `FCSE_Service_Areas/FeatureServer/0` | Answers; 46 areas | **Yes** |
| City of Dublin, `Sanitary_Sewer/FeatureServer/6` (Sanitary Mains) and `Water_Utility/FeatureServer/9` (Water Pipes) | Answer | **Yes** |
| City of Grove City, `SanitarySewer/MapServer/7` (San. Gravity Main) and `Water_Utilities_ArcPro/MapServer/9` (Main), on `arcgisweb.grovecityohio.gov:6443` | Answer, in 2.6–2.8 s | **Yes** |
| City of Canal Winchester, `Sanitary_View_Layer/FeatureServer/22` (Sanitary_Mains) and `Water_View_Layer/FeatureServer/17` (Water Mains) | Answer | **Yes** |
| City of Columbus water and sewer mains | **None published.** Checked the service directories on `gis.columbus.gov`, `arc.columbus.gov`, `maps.columbus.gov`, and `maps2.columbus.gov`, all 69 items on `opendata.columbus.gov`, and the 180 services of the City of Columbus ArcGIS Online organization. The only utility layers are electric service areas, an overflow-location test layer, and the lead service line inventory. The city's GIS page refers data requests to DPU GIS. | No |
| Ohio EPA public water system service areas | **No statewide layer.** `geo.epa.ohio.gov` has `Hosted/SWOhio_ServiceAreas/FeatureServer/0` (a southwest Ohio study copy of EPA's boundaries) and `Hosted/PWS_SewerSheds/FeatureServer/1`; neither covers any of the four test lots. `DrinkingWater/SWAP` holds source-water protection areas, not service areas. | No |
| Ohio EPA 208 facility planning areas, `SurfaceWater/Areawide_201_208_Ohio_EPA/FeatureServer/0` and `/1` | Answers, but these are wastewater **planning** areas and prescriptions (the golden lot is in the Columbus regional FPA), not where sewer is today | No |
| City of Reynoldsburg, `gis.reynoldsburg.gov/arcgis/rest/services/Editable/Sanitary/FeatureServer` | HTTP 500: "Could not generate or find MSD for service Editable/Sanitary.MapServer" | No |
| City of Westerville, `TransparencyHub/UtilityLines/FeatureServer/0` | Answers, but mains are published as masked points, not lines | No |
| `wgtn_admin`'s `SanitarySewer_GPS_View` (found searching "Worthington") | Worthington, **Minnesota** (extent near −95.6°) | No |
| Rome_Hilliard_Utilities (a consultant's project layer) and Grandview Heights' consultant-built Water & Sewer layer | Not the utility's own map | No |

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
| FEMA National Flood Hazard Layer | <https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer> (zones 28, FIRM panels 3, LOMRs 1, study availability 0) | Ohio study availability 2026-11-17T01:19:09Z. Flood report recordings 2026-11-17T01:19:09Z–01:23:04Z, re-recorded with the environmental check 2026-11-18T23:49Z (flood answers unchanged). |
| USFWS National Wetlands Inventory | <https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer> (wetlands 0, map export), <https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Data_Source/MapServer/3> (image year), <https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands_Status/MapServer/0> (mapping status) | Ohio mapping status 2026-11-18T23:49:13Z. Report recordings 2026-11-18T23:49Z. |
| Franklin County Stream Buffers | <https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/Franklin_County_Stream_Buffers/FeatureServer/0> | Report recordings 2026-11-18T23:49Z |
| USDA NRCS Soil Data Access (SSURGO) | <https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest> (`mupolygon`, `mapunit`, `muaggatt.engstafdcd`) | Each successful live report records its own `retrievedAt`. Real HTTP 502 responses recorded at 2026-11-18T23:17:00Z and 2026-11-19T03:38Z (see known limits). |
| Esri ArcGIS Living Atlas, USA Soils Map Units (USDA NRCS gSSURGO, published Dec 2025) | <https://services5.arcgis.com/7weheFjxuNkGGiZi/arcgis/rest/services/USA_Soils_Map_Units/FeatureServer/0> (`MUKEY`, `MUSYM`, `muname`, `engstafdcd`) | SDA fallback. Real responses recorded 2026-11-19T03:38:02Z (230-000918) and 03:38:03Z (Licking 00500729609000) in `backend/test/fixtures/ssurgo/`. |
| US EPA Community Water System Service Area Boundaries (v3.0, Mar 17, 2026) | <https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0> | Utilities recordings 2026-11-20T00:15:58Z–00:16:01Z |
| US EPA sewersheds of publicly owned treatment works (CWNS 2022) | <https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/National_Sewershed_Web_Map_Internal_WFL1/FeatureServer/0> (sewersheds), `/1` (plant endpoints) | Utilities recordings 2026-11-20T00:15:58Z–00:16:01Z |
| Ohio Department of Health homeowner sewage guidance | <https://odh.ohio.gov/know-our-programs/sewage-treatment-systems/information-for-homeowners/> | Read 2026-11-18; used only for the required local-health-district and site-and-soil-evaluation next action, not as parcel evidence. |

### Franklin County water and sewer

| Source | URL | Retrieved |
| --- | --- | --- |
| Franklin County Sanitary Engineering service areas | <https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCSE_Service_Areas/FeatureServer/0>; department page <https://www.franklincountyohio.gov/Agency-Directory/Sanitary-Engineering> | Utilities recordings 2026-11-20T00:15:58Z–00:16:00Z |
| City of Grove City sanitary gravity mains and water mains | <https://arcgisweb.grovecityohio.gov:6443/arcgis/rest/services/Web_GIS_Services_New/SanitarySewer/MapServer/7>, <https://arcgisweb.grovecityohio.gov:6443/arcgis/rest/services/Production_Services/Water_Utilities_ArcPro/MapServer/9> | 2026-11-20T00:16:00Z (Dartmoor Rd) |
| City of Dublin sanitary mains and water pipes | <https://services1.arcgis.com/NqY8dnPSEdMJhuRw/arcgis/rest/services/Sanitary_Sewer/FeatureServer/6>, <https://services1.arcgis.com/NqY8dnPSEdMJhuRw/arcgis/rest/services/Water_Utility/FeatureServer/9> | Queried live 2026-11-19 (25 S High St: sewer main 2.5 m, water main 15.6 m); no recording, as no test lot is in Dublin |
| City of Canal Winchester sanitary mains and water mains | <https://services3.arcgis.com/y4utLgB1hH3ocvdq/arcgis/rest/services/Sanitary_View_Layer/FeatureServer/22>, <https://services3.arcgis.com/y4utLgB1hH3ocvdq/arcgis/rest/services/Water_View_Layer/FeatureServer/17> | Queried live 2026-11-19 (31 E Waterloo St: sewer main 13.9 m, water main 4.3 m); no recording |

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

Current verification runs `vitest run test/ssurgoSoils.test.ts test/report.test.ts test/parcels.test.ts` for the provider replay, report isolation, and coverage paths; the complete backend suite is also run before merge.

- **FEMA times out** (FEMA forced to hang, flood limit 200 ms) on `ohio:39049:010-042534`:
  - The report still returns **`200`** within 2 s.
  - Flood becomes `unknown`: "FEMA's flood map service did not answer within 0.2 seconds, so no flood zone was checked."
  - Every other check is unchanged and coverage drops to `boundaryOnly`.
  - The timed-out report is **not cached**, so the next request asks FEMA again.
- **USDA SSURGO times out independently** (forced to hang, soils limit 200 ms) on the same parcel:
  - The report still returns **`200`** within 2 s and every non-septic check is unchanged.
  - Septic becomes `unknown`; it makes no suitability conclusion and still ends with the health-district site and soil evaluation next action.
  - The timed-out report is not cached, so the next request can ask USDA again.
  - If SDA alone hangs past its 3 s budget, the Living Atlas fallback still answers inside the 6 s check limit (`test/ssurgoSoils.test.ts`).
- **The water and sewer maps time out** (every source forced to hang, utilities limit 200 ms) on `ohio:39049:010-042534`:
  - The report still returns **`200`** within 2 s and every other check is unchanged.
  - Utilities becomes `unknown`: "EPA's water system and sewershed maps and Franklin County Sanitary Engineering's service area map didn't answer within 0.2 seconds, so water and sewer service weren't checked." It names Franklin County Sanitary Engineering.
  - The report is not cached. One source hanging alone (EPA's water map, or Grove City's sewer map) is cut off at that source's own limit; the others' answers stay, and the check is `needsReview`, never `evidenceFound` (`test/utilities.test.ts`).
- **OGRIP times out on the report route:** `504 PROVIDER_TIMEOUT`, `retryable: true`, with no guessed report.
- **OGRIP times out on parcel-ID search, address search, the parcel route, the explore map's area route and `/api/coverage`:** each returns `504 PROVIDER_TIMEOUT`, `retryable: true`, with no partial result.
- **An address search whose individual requests fit the per-request limit, but together exceed the search budget:** `504 PROVIDER_TIMEOUT`.

## Known limits

- **Wetlands are NWI's map, not a delineation.** In Ohio, NWI was drawn from 2007 imagery on every lot tested and misses many small, forested, or seasonally dry wetlands. Shares are approximate: they're measured on NWI's drawing at 512 px across the lot, and matched vector shares to within 0.01 percentage points on three lots. A wetland that only touches the lot's edge is reported "along the edge" and still asks for review.
- **Stream setbacks are Franklin only,** from the county's two mapped setback programs (Big Darby; Alum Creek and Big Walnut Creek). A city, village, or township with its own zoning may have its own stream rules, which the check doesn't read. It reports where the setback applies, not what the setback allows.

- **A city alone is not searched.** A street name without a house number returns up to ten lots on that street, and `0 <street>` finds lots with no assigned number. A city or township on its own answers `400` asking for a street or a parcel ID.
- **OGRIP publishes 0 acreage for Franklin.** `LandArea` is 0 for Franklin parcels, so `Parcel.acreage` is omitted there. The golden parcel's 3.015 legal acres come from the Franklin County Auditor and are cited only inside its zoning check.
- **5 counties have no NFHL data.** Fayette (39047), Henry (39069), Vinton (39163), Williams (39171) and Wyandot (39175) have no FEMA NFHL study, so flood is always `unknown` there.
- **SSURGO is screening evidence, not approval.** `engstafdcd` is the map unit's dominant-condition interpretation for septic-tank absorption fields. A parcel can cross several map units, inclusions may differ from the dominant soil, and the check does not establish sewer availability, system design, drain-field location, permitting, or site feasibility. The local health district and an on-site soil evaluation decide the next step.
- **The USDA endpoint was unavailable during implementation verification.** Soil Data Access returned HTTP 502 at 2026-11-18T23:17:00Z even for a one-row health query, and again at 2026-11-19T03:34Z and 03:38Z. The first response is saved in `backend/test/fixtures/ssurgo/sda-502-2026-11-18.json`; the two parcel recordings also replay SDA's real 502 before the fallback. The SDA success path is tested only for its documented table shape; no real SDA success response has been recorded yet.
- **Real septic results for the two reviewed parcels, from the Living Atlas fallback (2026-11-19).** 230-000918 (Franklin): Ko Kokomo silty clay loam 46.05%, CrB Crosby silt loam 38.31%, CeB2 Celina silt loam 15.64%, all “Very limited.” 00500729609000 (Licking): CkC2 Cincinnati silt loam 99.59%, HoD2 Homewood silt loam 0.41%, both “Very limited.” Cross-checks: the same map units and shares (to 0.01%) come from USDA FPAC's `nrcs-geodata/rest/services/soils/cg_soils` polygons (FY2026, current as of 2026-05-08), and UC Davis SoilWeb `muaggatt` gives the same five `engstafdcd` values.
- **The fallback can lag SDA by one annual SSURGO refresh.** The Living Atlas layer is Esri's annual gSSURGO build (published Dec 2025; survey versions OH049 v24, OH089 v23). The check names the Living Atlas copy in both the finding and the source whenever it is used.
- **The web search isn't on the live API yet.** `frontend/web/src/data/parcelSource.ts` searches the two canonical parcels only; `GET /api/parcels/search` is live, but the web doesn't call it yet.
- **Address fallback scope.**
  - When the OGRIP locator is down or doesn't know the street, the fallback matches `SitusAddressAll` only when the typed city lies in at most 3 counties (Census 2020 place names).
  - A postal city can point that fallback at the wrong county. Delaware County addresses use the postal city Prospect, but the Census village of Prospect is in Marion County, so the fallback would search Marion only. The locator steps still find those addresses.
  - A dense search box that hits OGRIP's 2,000-record limit without a match returns `[]` rather than widening.
- **Zoning is live in Franklin County only,** and only for lots under county zoning. It names the district; it does not say what can be built there. District shares are measured by testing a 300 × 300 grid of points across the lot; on 7 lots they matched exact areas to within 0.02 percentage points.
- **Map layers on the land view show the same sources' coverage.** Flood is drawn wherever FEMA has a study, wetlands wherever NWI has mapping, and stream setbacks, zoning lines, and road right-of-way in Franklin only; elsewhere those toggles say "Franklin County only". NWI's server answered `503 Server Unavailable` several times on Nov 18–19, 2026; the wetlands layer then says the source did not answer and offers a retry, and the API keeps no copy of that answer.
- **Water and sewer maps are not availability letters.** EPA modeled about 44% of community water system boundaries and many sewersheds from other data; the finding and limitation say when a boundary is modeled. A lot that touches a service area at all counts as inside it. A main within 30 m of the lot boundary counts as adjacent; that is a map distance, not a tap location.
- **Main distances in three cities only.** Dublin, Grove City, and Canal Winchester publish their main maps; the check reads a city's map only when the lot is within 500 m of its extent, and names each map's owner as it is coded (City of Dublin, City of Columbus, Del-Co Water Company, and so on). Columbus, the county's largest utility, publishes none, so Columbus lots get service areas but no distance, and the finding says so. A city map that shows no main near the lot says only that about its own mains.
- **Hand-verified access is one parcel.** Access evidence exists only for the golden parcel. A live access check against the county right-of-way layer is a later task.
