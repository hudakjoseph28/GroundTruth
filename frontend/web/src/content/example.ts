// Words for the example pages (/parcels/sample, /deals/sample, /walkthrough).
// Their data is made up (src/example/exampleFixture.ts), and every one of them
// says so with the same small tag. The pages say "example", never "sample".

/** Where the example lives. exampleFixture.test.ts checks these against its key. */
export const EXAMPLE_PATHS = { parcel: "/parcels/sample", deal: "/deals/sample" } as const;

export const EXAMPLE = {
  tag: {
    parcel: "Example parcel",
    deal: "Example deal",
    walkthrough: "Example closing",
    data: "Illustrative data",
    title:
      "Made up for the demo. Not a real parcel, deal, or Solana transaction; the aerial imagery and elevation under it are real.",
  },
  /** On the homepage and the search page. */
  link: "See an example parcel",
  linkNote: "Every layer and check filled in",
  /** The legend line for the example lot's outline. */
  boundary: "The example lot, drawn for the demo. No county publishes it.",
  /** Where a real page would link a receipt to Solana Explorer. */
  receipt: "Example receipt",
  receiptTitle: "An example value, not a Solana devnet transaction.",
  inspectorNote:
    "Example report: the sources are where a real report looks; these findings are made up for the demo.",
  /** The bridge from the example to the real devnet closing. */
  real: {
    lead: "This closing is an example.",
    link: "See a real released closing on Solana devnet",
  },
  parcelDeal: "Example closing on this lot",
  deal: {
    staged: "Example · test USDC · illustrative wallets",
    timelineOrder: "First to last",
    handoff: "Scan to open this example on your phone. No app or wallet needed.",
    documentsNote:
      "Example documents. Each fingerprint is the SHA-256 of the example's own text; no file exists.",
  },
  title: {
    parcel: "250 Hashing Rd · Example parcel",
    deal: "Example deal · Released",
    walkthrough: "Walkthrough · Example closing",
  },
} as const;
