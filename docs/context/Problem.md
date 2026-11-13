# GroundTruth · The problem

**This document governs product claims.** It distinguishes measured evidence, design scenarios, and pilot hypotheses so the team can tell a forceful story without pretending GroundTruth has already proven more than it has.

> **TL;DR**
> - **Buyer:** someone buying vacant land for the first time, usually to build a home.
> - **Problem:** a lot looks affordable and usable on a listing while its biggest facts (access, sewer, zoning, who's really selling) are still unresolved and scattered across records and professionals.
> - **Evidence:** **59%** of surveyed title professionals reported at least one seller-impersonation attempt in the prior year (ALTA 2026) vs. **28%** (ALTA 2024); **82%** rate vacant land at least somewhat common in this fraud; the FBI issued a June 2026 vacant-parcel warning.
> - **Product:** one place for evidence, open questions, responsible parties, and payment conditions, with the final test-USDC outcome enforced by a Solana escrow.
> - **Position:** GroundTruth is decision support and closing coordination. It is not a legal buildability opinion, title search, survey, identity service, or deed-transfer system.

GroundTruth answers three questions before money reaches the seller:

1. **Can I use this parcel for what I want to build?**
2. **Is the person selling it authorized to?**
3. **What still has to happen before my money moves?**

Our first buyer has found a lot but has probably never read a zoning code, asked about an easement, or coordinated a survey, title review, and site evaluation. They need **what to do next**. A repeat buyer running several deals needs **what's holding up each one**.

## Problem statement

A vacant lot's key facts are spread across listings, public records, local authorities, service providers, and professionals. Some can be looked up; some need a qualified person. A map shows a parcel touching a road; the buyer still needs the legal right to reach it and approval for a driveway. A tax record gives the title team a starting point on the owner; the person emailing payment instructions still needs independent verification. Same problem both times: **an early clue looks conclusive when the next check is invisible.**

**GroundTruth gives the buyer one place for the evidence, the open questions, and the conditions that govern payment.** Moving ahead, negotiating better, or walking away before paying are all wins.

The core product judgment is decisive: **we should not answer “yes, you can build” when the record cannot support that answer.** The winning experience is still useful when the answer is incomplete because it makes the missing decision, responsible professional, and effect on the buyer's money impossible to miss.

## What the evidence shows

### Seller impersonation targets vacant land

The FBI's Internet Crime Complaint Center (IC3) issued a June 2026 warning about criminals impersonating owners of vacant parcels and trying to sell without the owner's knowledge or consent, using fake IDs, impersonator-controlled contact details, and a fictitious deed. ALTA's prevention guidance says to reach the seller through a phone number independently found and validated, or addresses from trusted records. A seller-provided number plus a public record with the same owner name leaves identity unresolved. [FBI vacant-parcel advisory][fbi-advisory] · [ALTA prevention guidance][alta-guidance]

- **Title-firm exposure:** in ALTA's 2026 survey, **59%** reported at least one attempt in the prior calendar year, vs. **28%** in the 2024 survey (underlying years 2025 and 2023), a **31 percentage point** difference. These are respondent-level reports of attempts, including failed ones, not a per-sale probability or a count of successful frauds. *Use:* make seller verification visible in the normal closing flow.
- **Vacant land as a target:** **82%** rated vacant land at least somewhat common in seller impersonation fraud, the highest property type in ALTA's 2026 summary (a rating of the property type). *Use:* why vacant land is our starting segment.
- **Wider real-estate losses:** IC3 recorded **12,368 complaints** and **$275.1 million** in reported losses in 2025, up from **9,359** and **$173.6 million** in 2024 (**+32.2%** complaints, **+58.5%** losses). Broader than vacant-land impersonation; complaints reported to IC3. *Use:* context only.
- **Existing practice:** **94%** of firms in ALTA 2026 use multiple fraud-detection tools they find helpful. *Use:* a callback is one piece of evidence for the title reviewer; a clean call alone can't clear a deal.

ALTA 2026 surveyed **245 title insurance professionals** across 40 states, Washington, D.C., and the U.S. Virgin Islands. Both surveys describe respondents' experience; changes in reporting, detection, or respondent mix affect the comparison. [ALTA 2026 study and methodology summary][alta-study] · [ALTA 2026 infographic][alta-chart] · [ALTA 2024 study][alta-2024] · [FBI 2025 IC3 Annual Report, pp. 25–26][fbi-report]

### Buildability depends on local records

- **Jurisdiction matters.** Franklin County, Ohio's planning department administers county zoning for **10 of the county's 17 townships**; the other seven run their own. The recorder says surveys usually come through a lender or title company, and county GIS includes lot dimensions and some utilities. The report names the authority and what the record can establish. [Franklin County planning and zoning][franklin-zoning] · [Franklin County recording FAQs][franklin-faq]
- **Sewer isn't a given.** The EPA says **more than one in five U.S. households** rely on individual septic or small community cluster systems (a national figure on existing households). Franklin County Public Health publishes a separate site-review application for sewage treatment systems. For a given lot we establish whether public sewer is available and, if not, surface the site review. [EPA septic systems overview][epa-septic] · [Franklin County Public Health forms and permits][franklin-health]
- **Flood data has a source and a date.** Ohio DNR points buyers to FEMA's Map Service Center for official flood maps. [Ohio DNR flood maps and studies][ohio-flood]

**What we haven't proven:** how often lots fail a buyer's intended use, how long buyers spend gathering records, or how much GroundTruth saves. Those come from buyer and title-team interviews and a pilot.

## Scenarios to design for (hypothetical)

- **Lot beside a road.** The listing says accessible. We show the boundary appears to touch a road but legal access and driveway approval need review → title team checks recorded access, surveyor reviews the boundary, road authority covers driveways.
- **Rural lot, no confirmed sewer.** The buyer assumes septic. We show wastewater as unresolved, who confirms sewer, and where to request an on-site review → buyer decides on the result.
- **Remote seller pushes for a quick payout.** The owner, reached at an independently validated contact, says it's not for sale. The callback raises a dispute, the title reviewer holds, and the buyer sees the deposit, why it's held, and who's next → release fails while held; review or cancellation follows the agreed terms with a refund path. An unanswered call also routes to review.
- **Repeat buyer, several deals.** Each deal shows what's holding it, who acts next, and which approvals arrived → the ready deal pays the seller; the other stays open, no guesswork.

## Product decisions

- **Lead with the parcel.** First useful moment: open a lot and see its biggest unresolved issue, with boundary, report, and sources together. Ask for a wallet only at a payment action.
- **Show confidence on every finding.** Zoning, access, flood, utilities, and recorded restrictions each get a status and a dated source. Missing, stale, or conflicting? Say so and name who resolves it. Qualified wording: "may be suitable for a home, pending access and septic review."
- **Every approval has a person and a scope.** Title/closing professional: seller authority and closing readiness. Surveyor: boundary. Specialist or authority: wastewater. AI summarizes and flags gaps. The voice agent helps with outreach; the title team decides what to do with the result.
- **Carry conditions into payment.** A Solana escrow enforces required approvals, an active hold, and the bound payout destination. Deposit, hold, refund, and payment each have a clear status. For the hackathon contract, a reviewer hold blocks release and lets the buyer refund; all required approvals let anyone trigger payment only to the bound seller. IDs, contact details, and call contents stay private.
- **Fit the real closing.** On-chain covers approvals and settlement; the deed follows the off-chain process (Franklin County describes county-office review and a recording workflow). A production pilot needs a title or closing partner to define when release and refund are authorized. [Franklin County real-estate recording][franklin-recording]

## Proof, pilot, and beyond

- **Hackathon proof:** statewide OGRIP discovery tested across at least two counties, with one manually verified Franklin County golden parcel and deeper sourced checks only where records allow. After the report, a first-time buyer names the biggest open issue and who to contact. Then both devnet outcomes with staged parties and test USDC: a hold makes the payout fail with the balance intact; a final approval permits the exact bound payout once.
- **Pilot hypothesis:** buyers come early for the concrete next action; title and closing teams stay if approvals and exceptions are easier to track. Measure time to first actionable finding, share of material findings with traceable evidence, and share of paused deals whose next action buyers explain correctly. Track false flags and cases where missing records weakened the report.
- **Longer term:** residential vacant land first; expand beyond Ohio as comparable datasets appear. A deal record with evidence, signed approvals, and payment receipts could make physical-asset transactions easier to coordinate across organizations.

## Rules for the story

Tell it around a person who finds a lot they can afford, learns one fact that changes their plan, and sees why money moves or stays put.

- **59% vs. 28%** = title-firm exposure, always with its years and denominator.
- **82%** = why vacant land, always with its respondent-rating definition.
- IC3 totals = context, not a vacant-land number. Scenarios and pilot benefits = hypotheses.
- Never blur a public-record finding, a professional's approval, and an escrow receipt.

[fbi-advisory]: https://www.ic3.gov/PSA/2026/PSA260616
[fbi-report]: https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf
[alta-study]: https://www.alta.org/business-operations/research-initiatives-and-resources/critical-issue-studies/seller-impersonation-fraud-study
[alta-chart]: https://www.alta.org/file/Seller-Impersonation-Fraud-Study-Infographic.pdf
[alta-2024]: https://www.alta.org/file/Seller-Impersonation-Fraud-Study-Report.pdf
[alta-guidance]: https://www.alta.org/file/ALTA-Seller-Impersonation-Handout
[franklin-zoning]: https://www.franklincountyohio.gov/Business-Development/Development-Planning/Planning-Zoning
[franklin-faq]: https://www.franklincountyohio.gov/Agency-Directory/Recorder/Real-Estate/Recording-FAQs
[franklin-health]: https://myfcph.org/forms-permits/
[franklin-recording]: https://www.franklincountyohio.gov/Agency-Directory/Recorder/Real-Estate/Real-Estate-Recording
[epa-septic]: https://www.epa.gov/septic/about-septic-systems
[ohio-flood]: https://ohiodnr.gov/business-and-industry/municipalities-and-public-entities/floodplains/floodplain-mapping
