// Copy for "Save this report on Solana" on the parcel page. It says only what
// a memo supports: the report's fingerprint was recorded by a wallet at a
// time. That proves the report has not changed since; it does not make any
// finding true, and it moves no money.

export const SEAL = {
  eyebrow: "Solana devnet · optional",
  title: "Save this report on Solana",
  intro:
    "Record this report's fingerprint on Solana devnet from your own wallet. Anyone can later recompute the fingerprint and find it on chain, so they can tell the report hasn't changed since you saved it.",
  fingerprint: "Report fingerprint (SHA-256)",
  covers: (generatedAt: string) =>
    `Covers the parcel key, the report time (${generatedAt}), and every check with its sources and gaps.`,
  computing: "Computing the fingerprint…",
  noCrypto:
    "This browser can't compute a SHA-256 here, so the report can't be fingerprinted. Open the page over https in a current browser.",
  copyFingerprint: "Copy the report fingerprint",
  save: "Save this report on Solana",
  loadingWallet: "Loading the wallet…",
  send: (wallet: string) => `Sign and save with ${wallet}`,
  memoLabel: "Memo",
  fee: "Devnet only: the network fee is paid in devnet SOL, which has no value. Saving moves no funds and approves nothing.",
  status: {
    checking: "Checking the transaction with Solana devnet…",
    signing: "Approve the request in your wallet…",
    sent: "Sent. Waiting for confirmation on Solana devnet…",
    confirmed: "Saved on Solana devnet.",
    failed: "Not saved.",
  },
  /** After a blockhash expired with the memo unseen, so it can never land. */
  retrying: (attempt: number, of: number) =>
    `Retrying… Solana devnet didn't pick the transaction up before it expired, so nothing was saved. Approve the new request in your wallet (attempt ${attempt} of ${of}).`,
  attempt: (attempt: number, of: number) => `Attempt ${attempt} of ${of}.`,
  noSigner: "This wallet can't sign transactions here. Connect Phantom.",
  signature: "Signature",
  copySignature: "Copy the transaction signature",
  viewTx: "View on Solana Explorer",
  saveAgain: "Save again",

  check: {
    title: "Check a report",
    intro:
      "Paste a transaction signature or Explorer link. Your browser recomputes this page's fingerprint and reads the transaction straight from a public devnet RPC; no GroundTruth server is involved.",
    label: "Transaction signature or Explorer link",
    run: "Check",
    running: "Reading devnet…",
    invalid:
      "That isn't a Solana transaction signature or an Explorer link to one.",
    match: "Matches: this exact report was saved on Solana devnet.",
    matchDetail: (sender: string, when: string, slot: string) =>
      `Saved by ${sender}${when ? ` on ${when}` : ""}, slot ${slot}. A match shows the report hasn't changed since; it doesn't make any finding right.`,
    differ: "That transaction saved a different report.",
    differDetail:
      "The fingerprint on chain doesn't match this page's report. The report may have been regenerated or updated since it was saved.",
    onChain: "On chain",
    thisPage: "This page",
    noMemo:
      "That transaction has no GroundTruth report memo, so it saved no report.",
    failedOnChain:
      "That transaction failed on Solana devnet, so it saved nothing.",
    notFound:
      "Solana devnet has no confirmed transaction with that signature. If it was just sent, wait a few seconds and check again.",
    error:
      "Solana devnet couldn't be reached, so nothing is known yet. Try again.",
  },
};
