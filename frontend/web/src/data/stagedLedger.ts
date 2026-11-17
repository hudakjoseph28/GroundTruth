import { goldenParcel, type Check, type CheckKind, type DealState } from "@groundtruth/shared";

// Frontend-only demo layer for the staged closing on the golden parcel. The
// golden report (packages/shared) answers access, zoning, flood, utilities,
// and easements with real sources. These checks tell the reviewer side of a
// held closing: each is marked staged, carries no source, and has no
// signature. Confirmed state on the deal replaces them check by check
// (see ledger.ts).

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
  health: {
    authority: "Franklin County Public Health",
    title: "Forms and permits",
    url: "https://myfcph.org/forms-permits/",
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
  parcelKey: goldenParcel.key,
  biggestOpenQuestion: "access",
  dealState: "held",
  checks: [
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
