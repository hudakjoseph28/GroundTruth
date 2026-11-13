# Phase 2 · Parcel research

**Outcome.** A buyer can search and map real parcels in more than one Ohio county, open one source-backed report, and open one report that stays useful when a local source is missing.

**Read first**

- Parcel discovery in [Architecture](../../architecture/Architecture.md)
- The buyer scenarios in [Problem](../../context/Problem.md)
- The Terra-Zone section of [Reference builds](../../context/ReferenceBuilds.md)

## Carry in

Start from a cadastral parcel and draw its published boundary. Ohio’s OGRIP parcel layer is the first geometry source. Each check runs independently, with its own timeout and outcome, so one slow or empty provider still leaves the other findings visible.

Facts in the report come from source geometry or a server-side calculation. The model summarizes only the evidence supplied to it. A finding that has a record shows the authority, the source, and the date. A miss, a timeout, or a county without coverage stays unresolved and names who can resolve it.

Zoning comes from the responsible jurisdiction and, where published district geometry exists, from an intersection with the parcel. A parcel that spans districts, and a location without usable coverage, are both visible gaps. Mailing addresses stay out of the public report and out of model input.

## Leave behind

Terra-Zone’s drawn stand-in polygon, its preference for a frontend-supplied area, and its coordinate hash that picks a Princeton zoning row. Simulated elevation, soil, or zoning values stay out, including values a fallback might label as regional estimates. The report does not issue a GO / NO-GO verdict. It shows the biggest open question and the next person to contact.

## Demo scope

Prove two paths with the same pipeline:

- A strong report for the stage walkthrough, with at least one consequential finding and its source.
- An incomplete report in another county, where zoning or another local check is unresolved and the map still opens.

Track two numbers separately: counties that return a searchable boundary, and checks that return usable evidence. If time gets tight, keep broad discovery and shorten the list of local evidence types. The staged closing parcel should be one of the mapped parcels.

## Acceptance checks

1. Search returns mapped parcels from at least two Ohio counties, and each boundary shows where the geometry came from and when it was checked.
2. On the sample parcel, the biggest unresolved item has a status, a dated source or an explicit gap, and a concrete next action.
3. With the local zoning source unavailable, the report still shows the parcel and the supported findings, and it explains what is needed to resolve zoning.

## Depends on

The closing states live in [phase 1](../01-escrow/Escrow.md). This phase can render against fixtures before Devnet is ready. The phone and the live timeline are [phase 3](../03-connect-surfaces/ConnectSurfaces.md).
