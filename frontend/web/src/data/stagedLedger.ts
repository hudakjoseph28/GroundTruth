import { stagedParcel, type Check, type CheckKind, type DealState } from "@groundtruth/shared";

// Frontend-only demo layer for the parcel ledger. The shared fixture has a
// parcel and a draft deal but no report, so these checks show how a held
// closing reads. Every one is marked staged, carries no source, and has no
// signature: nothing here was retrieved for a real lot or signed on-chain.
// A real report from getParcelReport(), or confirmed state on the deal,
// replaces these check by check (see ledger.ts).

/** A public office or guide that explains who confirms a check. Not evidence. */
export interface Reference {
  authority: string;
  title: string;
  url: string;
}

export interface StagedCheck extends Check {
  staged: true;
  references: readonly Reference[];
}

const REFERENCES = {
  zoning: {
    authority: "Franklin County",
    title: "Planning and zoning",
    url: "https://www.franklincountyohio.gov/Business-Development/Development-Planning/Planning-Zoning",
  },
  recorder: {
    authority: "Franklin County Recorder",
    title: "Recording FAQs",
    url: "https://www.franklincountyohio.gov/Agency-Directory/Recorder/Real-Estate/Recording-FAQs",
  },
  health: {
    authority: "Franklin County Public Health",
    title: "Forms and permits",
    url: "https://myfcph.org/forms-permits/",
  },
  flood: {
    authority: "Ohio DNR",
    title: "Flood maps and studies",
    url: "https://ohiodnr.gov/business-and-industry/municipalities-and-public-entities/floodplains/floodplain-mapping",
  },
  alta: {
    authority: "ALTA",
    title: "Seller impersonation prevention guidance",
    url: "https://www.alta.org/file/ALTA-Seller-Impersonation-Handout",
  },
  fbi: {
    authority: "FBI IC3",
    title: "Vacant-parcel advisory, June 2026",
    url: "https://www.ic3.gov/PSA/2026/PSA260616",
  },
} satisfies Record<string, Reference>;

const check = (
  kind: CheckKind,
  status: Check["status"],
  role: string,
  finding: string,
  limitation: string,
  nextAction: string,
  references: readonly Reference[],
): StagedCheck => ({
  kind,
  status,
  finding,
  limitation,
  sources: [],
  responsibleParty: { role },
  nextAction,
  staged: true,
  references,
});

export const stagedLedger: {
  parcelKey: string;
  biggestOpenQuestion: CheckKind;
  /** The closing state this demo layer tells. The shared deal itself is still a draft. */
  dealState: DealState;
  checks: readonly StagedCheck[];
} = {
  parcelKey: stagedParcel.key,
  biggestOpenQuestion: "access",
  dealState: "held",
  checks: [
    check(
      "access",
      "needsReview",
      "Title reviewer, then surveyor",
      "The boundary appears to touch a mapped road.",
      "Touching a road is not a legal right to use it, and a driveway needs its own approval.",
      "The title team checks recorded access, the surveyor reviews the boundary, and the road authority covers driveways.",
      [REFERENCES.recorder],
    ),
    check(
      "zoning",
      "evidenceFound",
      "Township or county zoning office",
      "The zoning record lists a residential district. The lot may be suitable for a home, pending access and septic review.",
      "A zoning record is not a permit or a legal opinion on what you can build.",
      "Confirm the district and its permitted uses with the zoning office that covers this township.",
      [REFERENCES.zoning],
    ),
    check(
      "flood",
      "evidenceFound",
      "FEMA flood maps",
      "The lot sits outside the mapped special flood hazard area.",
      "Flood maps carry an effective date and can change. This is not a flood-insurance determination.",
      "Check the current FEMA map for the lot before closing.",
      [REFERENCES.flood],
    ),
    check(
      "utilities",
      "unknown",
      "Utility or local public health office",
      "We couldn't confirm public sewer or water service for this lot.",
      "No conclusion either way. Service may reach the lot, or it may need a well and septic.",
      "Ask the utility whether service reaches the lot.",
      [REFERENCES.health],
    ),
    check(
      "easements",
      "unknown",
      "Title reviewer",
      "No search of recorded documents is attached yet.",
      "Recorded rights or restrictions can limit where and what you build.",
      "The title team searches recorded easements and restrictions.",
      [REFERENCES.recorder],
    ),
    check(
      "sellerAuthority",
      "held",
      "Title reviewer",
      "The owner, reached at an independently verified number, said the lot is not for sale. The title reviewer placed a hold.",
      "A hold blocks the payout until it is resolved. It is not a finding of fraud.",
      "The title reviewer investigates the dispute. The buyer can ask for a refund while the hold is active.",
      [REFERENCES.alta, REFERENCES.fbi],
    ),
    check(
      "survey",
      "signedOff",
      "Surveyor",
      "The surveyor signed off on the boundary.",
      "Covers the boundary only. It says nothing about access rights or the seller.",
      "Nothing further for the survey.",
      [],
    ),
    check(
      "septic",
      "unknown",
      "Septic reviewer",
      "No site review is on file.",
      "Without public sewer, a septic system needs an on-site review before anyone can say it will work.",
      "Request a site review from the local public health office.",
      [REFERENCES.health],
    ),
    check(
      "closing",
      "needsReview",
      "Title or closing professional",
      "One of three required sign-offs is in, and a title hold is active.",
      "Payment cannot release until every required reviewer signs and no hold is active.",
      "Resolve the title hold, then collect the title and septic sign-offs.",
      [],
    ),
  ],
};
