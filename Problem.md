# GroundTruth · The problem

GroundTruth helps someone buying vacant land for the first time answer three questions before money goes to the seller:

1. **Can I use this parcel for what I want to build?**
2. **Is the person offering to sell it authorized to do so?**
3. **What still has to happen before my money can move?**

Our first buyer has found a vacant lot and wants to build a home on it. They know the price, approximate location, and what the listing says. They may have little experience reading a zoning code, asking about an easement, or coordinating a survey, title review, and site evaluation. A repeat buyer faces many of the same steps and may be running several deals at once. The first buyer needs help deciding what to do next. The repeat buyer needs a reliable way to see what is holding up each deal.

## Problem statement

A vacant lot can look affordable and usable on a listing while its most consequential facts are still unresolved. The information needed to decide is distributed across listings, public records, local authorities, service providers, and professionals. Some of it can be looked up. Some requires someone qualified to interpret a document, inspect the site, or verify the seller. The buyer has to work out which is which and carry that understanding into closing.

A map can show a parcel touching a road. A buyer still needs to know whether they have the right to reach the lot and whether they can establish a driveway. A tax record can give the title team a starting point for researching the owner. The person emailing payment instructions still needs independent verification. Both are examples of the same product problem: an early clue looks conclusive when the next check is invisible.

**GroundTruth should give the buyer one place to see the evidence, the open questions, and the conditions that govern payment.** A good outcome can be moving ahead, negotiating with better information, or walking away before paying. The product creates value at the point of decision, even when no sale closes.

## What the evidence shows

### Seller impersonation is a documented risk for vacant land

The FBI's Internet Crime Complaint Center (IC3) issued a June 2026 warning about criminals impersonating owners of vacant parcels and attempting to sell without the owner's knowledge or consent. The cases described include fake IDs, contact details controlled by the impersonator, and a fictitious deed. ALTA's prevention guidance calls for reaching the seller through a phone number independently found and validated or using addresses from trusted records. A seller-provided number and a public record showing the same owner name leave the seller's identity unresolved. [FBI vacant-parcel advisory][fbi-advisory] · [ALTA prevention guidance][alta-guidance]

| Signal | Measured result | What it supports for GroundTruth |
| --- | --- | --- |
| Exposure at title firms | In ALTA's 2026 survey, **59%** reported at least one attempt during the prior calendar year, versus **28%** in its 2024 survey. The underlying calendar years were 2025 and 2023. That is a **31 percentage point** difference between survey results. | Make seller verification visible in the normal closing flow. These are respondent-level reports of attempts, including unsuccessful ones. They give no per-sale probability or count of successful frauds. |
| Vacant land as a target | **82%** of respondents rated vacant land at least somewhat common in seller impersonation fraud, the highest property type in ALTA's 2026 summary. | Vacant land is a defensible starting segment. The percentage measures respondents' ratings of the property type. |
| Financial consequences in the wider real-estate category | IC3 recorded **12,368 complaints** and **$275.1 million** in reported losses in 2025, up from **9,359 complaints** and **$173.6 million** in 2024. The increases were **32.2% in complaints** and **58.5% in reported losses**. | Real-estate fraud can carry substantial consequences. This category is broader than vacant-land seller impersonation and the totals reflect complaints reported to IC3. |
| Existing verification practice | **94%** of firms in the 2026 ALTA study reported using multiple fraud detection tools they considered helpful. | A callback fits as one source of evidence for the title reviewer. A clean call alone cannot clear the deal. |

The 2026 ALTA study surveyed **245 title insurance professionals** across 40 states, Washington, D.C., and the U.S. Virgin Islands. The two surveys describe the experience of their respondents. Changes in reporting, detection, or the mix of respondents can affect the comparison. [ALTA 2026 study and methodology summary][alta-study] · [ALTA 2026 infographic][alta-chart] · [ALTA 2024 study][alta-2024] · [FBI 2025 IC3 Annual Report, pp. 25–26][fbi-report]

### Buildability depends on local records and site-specific decisions

Franklin County, Ohio, illustrates why the parcel's jurisdiction matters. Its planning department administers county zoning for **10 of the county's 17 townships**. The other seven administer their own zoning. The county recorder also says surveys are typically obtained through a lender or title company, and its GIS maps include information such as lot dimensions and some utilities. A useful report identifies the relevant authority and explains what the available record can establish. [Franklin County planning and zoning][franklin-zoning] · [Franklin County recording FAQs][franklin-faq]

The EPA says **more than one in five U.S. households** rely on individual septic or small community cluster systems. Franklin County Public Health publishes a separate site-review application for sewage treatment systems. The national figure describes existing household wastewater treatment. For a specific lot, the product needs to establish whether public sewer service is available and, if on-site treatment is needed, surface the applicable site review. Flood information likewise has a source and an effective date. Ohio's Department of Natural Resources points buyers to FEMA's Map Service Center for official flood maps and related products. [EPA septic systems overview][epa-septic] · [Franklin County Public Health forms and permits][franklin-health] · [Ohio DNR flood maps and studies][ohio-flood]

These sources describe why the checks matter. We have yet to establish how often vacant lots fail a buyer's intended use, how much time buyers spend gathering records, or how much money GroundTruth could save. Those are questions for buyer and title-team interviews and a pilot with real parcels.

## Scenarios to design for

The examples below are hypothetical. They describe what the buyer should learn and what action becomes available.

| Situation | What GroundTruth makes clear | What happens next |
| --- | --- | --- |
| **First-time buyer finds a lot beside a road.** The listing calls it accessible and the parcel map looks convincing. | The mapped boundary appears to touch a road. Legal access and any driveway approval still need review. | The title team can look for recorded access rights, a surveyor can review the physical boundary, and the relevant road authority can address driveway requirements. The buyer sees the open question before committing. |
| **A rural lot has no confirmed sewer connection.** The buyer assumes they can install septic. | Wastewater service is unresolved. The report explains who can confirm sewer service and where to request an on-site review if needed. | The buyer requests the review and can decide whether to proceed once the result and any conditions are known. |
| **A remote seller pushes for a quick payout.** The title team reaches a person at an independently validated contact who says the parcel is not for sale. | The callback raises a dispute. The title reviewer places a hold. The buyer sees the deposit amount, why it is held, and who handles the next step. | A release request fails while the hold is active. Review or cancellation follows the agreed terms, with a defined refund path. An unanswered call routes to review as well. |
| **A repeat buyer has multiple deals in progress.** One survey is late and one closing is ready. | Each deal shows the condition holding it up, who owns the next action, and which approvals have arrived. | On the ready deal, the closing professional confirms the closing conditions and the agreed seller receives payment. The other deal stays open without guesswork about its status. |

## Product decisions this should drive

- **Lead with the parcel and intended use.** The first useful interaction is opening a lot and understanding its biggest unresolved issue. Put the boundary, the report, and its sources together. Ask for a wallet when the buyer takes a payment action.
- **Show the confidence behind each finding.** Give zoning, access, flood exposure, utilities, and recorded restrictions a clear status and a dated source where one is available. If a source is missing, stale, or in conflict, surface the uncertainty and name who can resolve it. Use qualified wording such as “may be suitable for a home, pending access and septic review.”
- **Give each approval a person and a scope.** The title or closing professional handles seller authority and closing readiness. A surveyor provides boundary evidence. The appropriate specialist or authority handles wastewater feasibility. AI summarizes records and flags gaps. The voice agent assists with outreach, with the title team deciding how to act on the result.
- **Carry the deal's conditions into payment.** GroundTruth can show conditions in plain English and have a Solana escrow enforce the required approvals, active holds, and agreed payout destination. A deposit, a held payout, a refund, and a seller payment should each have an understandable status. Keep identity documents, contact details, and call contents private.
- **Fit the real closing process.** The first on-chain record represents approvals and settlement for the deal. The deed follows the applicable off-chain process. For example, Franklin County describes review by county offices and a recording workflow for real-estate transfers. A production pilot needs a title or closing partner to define when release and refund are authorized. [Franklin County real-estate recording][franklin-recording]

## First proof and the path forward

**Hackathon proof.** Use one curated Ohio jurisdiction, a source-backed parcel report, and staged parties. A first-time buyer should be able to name the biggest unresolved issue and the next person to contact after seeing the report. Then demonstrate both outcomes on Solana Devnet using test USDC. In the disputed deal, a reviewer records a hold and the payout fails on-chain with the balance intact. In the cleared deal, the final required approval arrives and the seller receives payment. Show the same deposit and approval states the buyer would see in a normal session.

**Pilot hypothesis.** Buyers will use GroundTruth early because the report gives them a concrete next action. Title and closing teams will keep using it if approvals and exceptions are easier to track. Compare a few real deal walkthroughs with the existing workflow. Measure time to the first actionable finding, the share of material findings with traceable evidence, and the share of paused deals whose next action buyers can correctly explain. Track false flags and cases where missing records made the report less useful. A single demo can establish that the payment controls work in the staged cases. A pilot can test whether the workflow helps people make better decisions.

**Longer-term direction.** Start with vacant residential land in one jurisdiction. Add coverage as local data and reviewer workflows are validated. Repeat buyers can reuse the same diligence process across parcels. Over time, a deal record with evidence, signed approvals, and payment receipts could make physical-asset transactions easier to coordinate across organizations. That is the opportunity to test before expanding into other property types or ownership products.

## Handoff for product, design, and Grok

Build the story around a person who finds a lot they can afford, learns one fact that changes their plan, and can see why money moves or stays put. Use the **59% versus 28%** survey comparison as evidence of title-firm exposure, with its years and denominator attached. Use the **82%** figure as evidence of why vacant land is the starting point, with its respondent-rating definition attached. Keep the wider IC3 totals as context. Treat the scenario details and expected pilot benefits as hypotheses or examples. Preserve the difference between a public-record finding, a professional's approval, and an escrow receipt. The story can be more ambitious as long as those claims stay precise.

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
