import type {
  Check,
  CheckKind,
  Parcel,
  ResponsibleParty,
} from "@groundtruth/shared";

/**
 * Checks with no evidence adapter yet. Each one is `unknown` and says so
 * plainly: nothing here was read from a record about this parcel. The text
 * names what is missing, why it matters, who resolves it, and what to ask.
 *
 * Contact links are public office pages, not evidence, and are given only
 * where one was checked by hand. Franklin County pages were confirmed live
 * on 2026-11-16 (the same pages frontend/web/src/data/stagedLedger.ts
 * cites). Other counties get the office by name and no link.
 */
export const TEMPLATE_KINDS = [
  "zoning",
  "access",
  "utilities",
  "easements",
  "sellerAuthority",
  "survey",
  "septic",
] as const satisfies readonly CheckKind[];

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export function isTemplateKind(kind: CheckKind): kind is TemplateKind {
  return (TEMPLATE_KINDS as readonly CheckKind[]).includes(kind);
}

const FRANKLIN_FIPS = "39049";

const FRANKLIN_LINKS = {
  zoning:
    "https://www.franklincountyohio.gov/Business-Development/Development-Planning/Planning-Zoning",
  recorder:
    "https://www.franklincountyohio.gov/Agency-Directory/Recorder/Real-Estate/Recording-FAQs",
  health: "https://myfcph.org/forms-permits/",
} as const;

/** Seller-impersonation guidance from the American Land Title Association. */
const ALTA_SELLER_IMPERSONATION =
  "https://www.alta.org/file/ALTA-Seller-Impersonation-Handout";

type Template = Omit<Check, "kind" | "status" | "sources">;

export function templateCheck(kind: TemplateKind, parcel: Parcel): Check {
  return { kind, status: "unknown", sources: [], ...TEMPLATES[kind](parcel) };
}

const TEMPLATES: Record<TemplateKind, (parcel: Parcel) => Template> = {
  zoning: (parcel) => ({
    finding: "No zoning record has been checked for this lot yet.",
    limitation: `GroundTruth has no zoning source for ${parcel.county} County, so it cannot say which district applies or what may be built here.`,
    responsibleParty: {
      role: "Zoning office for the township, city, or village that contains the lot",
      ...(parcel.countyFips === FRANKLIN_FIPS && {
        organization:
          "Franklin County Planning & Zoning (unincorporated areas)",
        publicContactUrl: FRANKLIN_LINKS.zoning,
      }),
    },
    nextAction:
      "Ask the zoning office that covers this lot which district applies and whether it allows what you plan to build.",
  }),
  access: (parcel) => ({
    finding: "No record of legal road access has been checked for this lot.",
    limitation:
      "A boundary that touches a road does not prove a legal right to use it, and a driveway needs its own approval.",
    responsibleParty: {
      role: "Title reviewer, then surveyor",
      ...recorder(parcel),
    },
    nextAction:
      "Ask a title company to search recorded access rights, and ask the road authority what a driveway permit needs.",
  }),
  utilities: () => ({
    finding: "No utility record has been checked for this lot.",
    limitation:
      "No conclusion either way: public water and sewer may reach the lot, or it may need a well and a septic system.",
    responsibleParty: { role: "Water and sewer utility for this area" },
    nextAction:
      "Ask the utility that serves this area whether water and sewer reach the lot, and what connecting would cost.",
  }),
  easements: (parcel) => ({
    finding: "No search of recorded easements or restrictions is attached.",
    limitation:
      "Recorded easements, covenants, or restrictions can limit where and what you build. None are ruled in or out.",
    responsibleParty: { role: "Title reviewer", ...recorder(parcel) },
    nextAction:
      "Ask a title company to search the recorded documents for this parcel.",
  }),
  sellerAuthority: () => ({
    finding: "The seller's right to sell this lot has not been verified.",
    limitation:
      "This report does not check ownership records or the seller's identity. Sellers who impersonate the real owner often target vacant land (see the linked ALTA guidance).",
    responsibleParty: {
      role: "Title reviewer",
      organization: "American Land Title Association (guidance)",
      publicContactUrl: ALTA_SELLER_IMPERSONATION,
    },
    nextAction:
      "Have a title company confirm the owner of record and reach the owner through contact details it finds independently, not ones the seller supplied.",
  }),
  survey: () => ({
    finding: "No survey of this lot is attached.",
    limitation:
      "The boundary shown comes from Ohio's statewide parcel map (OGRIP), which is not a survey. The real corners and lines can differ.",
    responsibleParty: { role: "Licensed Ohio surveyor" },
    nextAction:
      "Hire a licensed Ohio surveyor to locate the boundary before you close.",
  }),
  septic: (parcel) => ({
    finding: "No septic site review is on file for this lot.",
    limitation:
      "If public sewer does not reach the lot, a septic system needs a site and soil evaluation before anyone can say one will work.",
    responsibleParty: {
      role: "Local health district (sewage treatment systems)",
      ...(parcel.countyFips === FRANKLIN_FIPS && {
        organization: "Franklin County Public Health",
        publicContactUrl: FRANKLIN_LINKS.health,
      }),
    },
    nextAction:
      "If the lot has no sewer, ask the health district for a site and soil evaluation before you close.",
  }),
};

function recorder(
  parcel: Parcel,
): Pick<ResponsibleParty, "organization" | "publicContactUrl"> {
  return parcel.countyFips === FRANKLIN_FIPS
    ? {
        organization: "Franklin County Recorder",
        publicContactUrl: FRANKLIN_LINKS.recorder,
      }
    : { organization: `${parcel.county} County Recorder` };
}
