import type {
  DealDocumentType,
  DealParticipantRole,
} from "@groundtruth/shared";

// Copy for deal documents, on the deal page and the reviewer portal. The
// page shows metadata only; a file is opened only after a participant signs.

export const DOCUMENT_TYPE_LABELS: Record<DealDocumentType, string> = {
  titleCommitment: "Title commitment",
  surveyPlat: "Survey plat",
  septicSoilEvaluation: "Septic / soil evaluation",
  zoningLetter: "Zoning letter",
  other: "Other",
};

export const UPLOADER_LABELS: Record<DealParticipantRole, string> = {
  buyer: "Buyer",
  seller: "Seller",
  title: "Title reviewer",
  survey: "Survey reviewer",
  septic: "Septic reviewer",
};

export const DOCUMENTS = {
  title: "Documents",
  banner:
    "Staged demo: don't upload real personal documents. Files here are test files for a devnet deal.",
  intro:
    "Supporting documents the deal's buyer, seller, and reviewers uploaded. This page shows only what each one is and its fingerprint (SHA-256); opening a file takes a wallet signature from someone on the deal.",
  empty: "No documents on this deal yet.",
  loading: "Loading documents…",
  loadError: "The documents could not be loaded.",
  uploadedBy: (role: string) => `Uploaded by ${role.toLowerCase()}`,
  hash: "SHA-256",
  copyHash: "Copy the full SHA-256",
  cited: (role: string) => `The ${role.toLowerCase()}'s approval committed to this hash on-chain.`,
  participant: {
    open: "I'm on this deal: upload or open files",
    note: "Connect the wallet bound to this deal. Signing a message proves it is yours; it moves no funds and approves nothing.",
    youAre: (role: string) => `Connected as the ${role.toLowerCase()}.`,
    notOnDeal:
      "This wallet isn't the buyer, seller, or a reviewer on this deal, so it can't upload or open files.",
    noSignMessage: "This wallet can't sign messages. Use Phantom.",
  },
  view: {
    button: "Open file",
    signing: "Sign in your wallet…",
    loading: "Opening…",
    ready: (filename: string) => `Download ${filename}`,
  },
  upload: {
    title: "Upload a document",
    type: "What is it?",
    file: "File (PDF, PNG, or JPG, up to 10 MB)",
    submit: "Sign and upload",
    hashing: "Reading the file…",
    signing: "Sign the upload in your wallet…",
    sending: "Uploading…",
    done: (filename: string) => `Uploaded “${filename}”. Checking its parcel ID…`,
    tooBig: "That file is larger than 10 MB.",
    wrongType: "Choose a PDF, PNG, or JPG. The file's contents must match its extension.",
    noFile: "Choose a file first.",
  },
  check: {
    title: "Check a file",
    body: "Pick a file to see whether it is exactly one of this deal's documents. It is hashed in your browser and never uploaded.",
    label: "File to check",
    hashing: "Hashing in your browser…",
    match: (filename: string, role: string) =>
      `Match: this is exactly “${filename}”, uploaded by the ${role.toLowerCase()}.`,
    citedToo: (role: string) =>
      `The ${role.toLowerCase()}'s approval on Solana devnet names this same hash.`,
    citedOnly:
      "No uploaded document has this hash, but an approval on this deal names it on-chain.",
    noMatch: "No match: this file is not any document on this deal. Even a one-byte change gives a different hash.",
    yourHash: "This file's SHA-256",
  },
  errors: {
    rejected: "You declined the signature in your wallet. Nothing was sent.",
    unknown: "That didn't work. Try again in a moment.",
  },
} as const;

/**
 * The advisory parcel check on each document. The public sees the status;
 * a signed participant also sees what the document says.
 */
export const PARCEL_CHECK = {
  checking: "Checking the parcel ID…",
  matches: "Matches this parcel",
  different: "Different parcel ID found",
  differentId: (found: string) => `Different parcel ID found: ${found}`,
  dealIs: (parcelId: string) => `This deal is for parcel ${parcelId}.`,
  signToSee: "Someone on the deal can sign to see which one.",
  noParcelId: "No parcel ID found in this document",
  unavailable: "Parcel ID not checked",
  advisory: "Read by AI. Advisory only: it doesn't approve, hold, or change the deal.",
  readBy: (model: string) => `Read by AI (${model}). Advisory only: it doesn't approve, hold, or change the deal.`,
  found: {
    title: "What the document says",
    type: "Document",
    parcelId: "Parcel ID",
    address: "Address",
    finding: "Key finding",
    none: "Not found",
  },
  findings: {
    show: "Show what each document says",
    refresh: "Refresh what the documents say",
    signing: "Sign in your wallet…",
    loading: "Loading…",
    note: "Signing shows you the parcel ID, address, and key finding the API read from each file. Only people on the deal can see them.",
  },
  review: {
    warning: (count: number) =>
      count === 1
        ? "A document on this deal names a different parcel ID. Read it before you approve."
        : `${count} documents on this deal name a different parcel ID. Read them before you approve.`,
    chosen: "The document you chose names a different parcel ID than this deal.",
    advisory: "This check is advisory. It doesn't stop you from approving or holding.",
  },
} as const;

export const APPROVE_WITH_DOCUMENT = {
  label: "Relying on a document (optional)",
  none: "No document",
  note: "The approval transaction adds a memo with this document's SHA-256, so anyone can check which file you relied on.",
} as const;

export const TIMELINE_DOCUMENT = {
  relying: "Relying on",
  unmatched: "Document hash on-chain (no matching upload)",
  hash: "hash on-chain",
} as const;
