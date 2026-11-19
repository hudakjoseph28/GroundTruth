// Copy for "Verify on-chain" on the deal page. The panel reads the escrow
// account from a public devnet RPC in the visitor's browser and lays it beside
// what the page shows. It says only what that read supports: a match means
// the fields listed agree at the slot read, nothing more.

export const VERIFY = {
  eyebrow: "Independent check",
  title: "Verify on-chain",
  intro:
    "Your browser reads this deal's escrow account and vault straight from a public Solana devnet RPC, decodes it with the program's published IDL, and compares it with this page. No GroundTruth server is involved.",
  run: "Verify on-chain",
  again: "Check again",
  running: "Reading devnet…",
  outdated: "This page has updated since the check. Check again to compare the new state.",
  noAccount: "This deal has no escrow account yet, so there is nothing on-chain to check.",
  columns: { field: "Field", chain: "On-chain", app: "GroundTruth", result: "Result" },
  agree: "Agrees",
  differ: "Differs",
  matches: "Matches the chain",
  matchesDetail: (count: number) => `All ${count} fields agree with the escrow account.`,
  mismatch: (count: number) =>
    count === 1 ? "1 field does not match the chain" : `${count} fields do not match the chain`,
  mismatchDetail:
    "The chain decides whether money moves, so the on-chain value is the true one.",
  mismatchLine: (label: string, chain: string, app: string) =>
    `${label}: on-chain ${chain}, GroundTruth ${app}.`,
  source: (rpc: string, slot: string, time: string) =>
    `Read from ${rpc.replace(/^https?:\/\//, "")} at slot ${slot}, ${time}.`,
  accounts: {
    pda: "Deal account (PDA)",
    vault: "Vault",
  },
  failed: {
    title: "Does not match the chain",
    unknownTitle: "Not verified",
    missing: (address: string) =>
      `No account exists at ${address} on devnet, but this page lists it as the escrow account.`,
    foreign: (owner: string) =>
      `The account exists but belongs to program ${owner}, not the GroundTruth escrow program.`,
    undecodable: (reason: string) =>
      `The account belongs to the escrow program but does not decode as a deal: ${reason}`,
    error: "The devnet RPC could not be read, so nothing was compared. This says nothing either way about the deal.",
  },
  fields: {
    address: "Escrow address",
    state: "State",
    amount: "Amount",
    mint: "Mint",
    buyer: "Buyer",
    seller: "Seller",
    payout: "Seller payout account",
    reviewer: (role: string) => `${role} reviewer`,
    hold: "Hold",
    vault: "Vault balance",
  },
  values: {
    derived: "PDA of buyer + deal ID",
    approved: "Approved",
    notApproved: "Not approved",
    optional: "optional",
    notAssigned: "Not assigned",
    noHold: "No hold",
    closed: "account closed when emptied",
    notToken: "Not a token account",
    unit: "test USDC",
    expectFunded: "in escrow",
    expectEmpty: "nothing left in escrow",
  },
  notes: {
    vaultOwner: "The vault is not controlled by this deal's PDA.",
    vaultMint: "The vault holds a different token than the deal's mint.",
    vaultClosed: "The vault was closed while the deal still holds funds.",
    surplus: (amount: string) =>
      `Includes ${amount} test USDC sent to the vault outside the deal; the program never pays it out.`,
    reviewerWallet: "A different wallet holds this role on-chain.",
    reviewerRequired: "On-chain and GroundTruth disagree on whether this approval is required.",
    holdTime: "The hold's time differs.",
  },
} as const;
