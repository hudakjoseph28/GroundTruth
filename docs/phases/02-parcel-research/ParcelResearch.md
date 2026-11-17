# Phase 2 · Parcel research

**Owners:** Gagan (data and report pipeline) + Joey (search, map, and report UI).

**Outcome:** A buyer searches and maps real parcels in more than one Ohio county, opens one source-backed report, and opens one report that stays useful when a local source is missing.

**Read first:** parcel discovery in [Architecture](../../architecture/Architecture.md) · `Parcel`, `Check`, and the parcel routes in [DataContract](../../architecture/DataContract.md) · buyer scenarios in [Problem](../../context/Problem.md) · [Terra-Zone](../../context/ReferenceBuilds.md#terra-zone) · "Search" and "Opening a parcel" in [Vision](../../design/Vision.md)

## Deliverables

- OGRIP adapter and parcel/report routes under `backend/src` using the v1 shared schemas.
- Search, result list, parcel map, evidence stack, and all loading/empty/unknown/error states under `frontend/web/src`.
- `golden-parcel.json` and `second-county-parcel.json` in `packages/shared/src/fixtures`, populated only after manual source verification.
- A coverage note recording the two tested counties, exact parcel keys, source URLs, retrieval time, and which evidence adapters returned usable facts.

## Build this

- **Start from a cadastral parcel and draw its published boundary.** Query Ohio's official statewide service through the backend: `https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer`. Use Ohio's LBRS locator for address search. Do not download the statewide layer into the browser.
- **Every check runs independently** with its own timeout and outcome, so one slow or empty provider never hides the other findings.
- **Facts come from source geometry or a deterministic server-side calculation.** The first pass uses hand-written plain-English templates; a model is optional after the sources and limitations render correctly. A finding with a record shows authority, source, and date. A miss, timeout, conflict, or uncovered county stays unresolved and names who can resolve it.
- **Zoning** comes from the responsible jurisdiction and, where district geometry is published, an intersection with the parcel. Multi-district parcels and no-coverage locations are visible gaps.
- **Mailing addresses stay out** of the public report and out of model input.

## Leave out

Terra-Zone's drawn stand-in polygon, its preference for a frontend-supplied area, and its coordinate hash that picks a Princeton zoning row. No simulated elevation, soil, or zoning values, including "regional estimate" fallbacks. **No GO / NO-GO verdict:** show the biggest open question and the next person to contact.

## Demo scope

- **A strong Franklin County report** for the stage walkthrough: at least one consequential finding with its source and one honest unresolved item. Select the parcel only after checking the published geometry and record manually; do not invent an ID to satisfy the fixture.
- **An incomplete report** in another county: zoning or another local check unresolved, map still opens.
- Track two numbers separately: counties returning a searchable boundary, and checks returning usable evidence. If time is tight, keep broad discovery and shorten the list of local evidence types. The staged closing parcel is one of the mapped parcels.

## Acceptance checks

1. Search returns mapped parcels from at least two Ohio counties, and each boundary shows where the geometry came from and when it was checked.
2. On the sample parcel, the biggest unresolved item has a status, a dated source or an explicit gap, and a concrete next action.
3. With the local zoning source unavailable, the report still shows the parcel and the supported findings, and explains what's needed to resolve zoning.

Run and report:

```bash
pnpm --filter shared typecheck
pnpm --filter backend test
pnpm --filter web test
pnpm --filter web build
```

Manual proof includes a desktop and 390px screenshot of the golden parcel, the two live OGRIP source URLs, and one forced adapter-timeout result. If an external service is unavailable, the recorded fixture keeps the demo usable while the interface still labels when the evidence was retrieved.

## Cut line

Ohio-wide **discovery** is the breadth claim. Deep zoning, access, utility, easement, and septic conclusions across all counties are not. When time is tight, preserve real boundaries, source metadata, one golden report, and honest unknown states; cut additional local adapters before cutting provenance.

## Depends on

Closing states come from [phase 1](../01-escrow/Escrow.md); render against fixtures until devnet is ready. Phone and live timeline are [phase 3](../03-connect-surfaces/ConnectSurfaces.md).
