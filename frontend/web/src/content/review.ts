// Copy for the reviewer portal (/review).

export const REVIEW = {
  title: "Reviewer portal",
  intro:
    "Sign your decision on a staged closing with your own wallet. GroundTruth never signs for you; the escrow program on Solana devnet checks that this wallet is the reviewer bound to the deal.",
  devnet: "Solana devnet only · staged test deals",
  connect: "Connect Phantom",
  connecting: "Connecting…",
  disconnect: "Disconnect",
  connectedAs: (short: string) => `Connected as ${short}`,
  noPhantom:
    "Phantom isn't available in this browser. Install the Phantom extension, or on a phone open this page in the Phantom app's browser.",
  openInPhantom: "Open in Phantom",
  phantomNetwork:
    "Set Phantom to Solana devnet (Settings → Developer Settings → Testnet mode). Transactions from this page always go to devnet.",
  loading: "Looking for your deals…",
  none: "This wallet isn't a reviewer on any staged deal. Connect the wallet the deal was set up with.",
  loadError: "The deals could not be loaded. Check your connection and try again.",
  retry: "Try again",
  yourRole: (roles: string) => `You review: ${roles}`,
  signedBy: "Sign-offs",
  openDeal: "Open the deal page",
  parcel: "Parcel",
  amount: (amount: string) => `${amount} test USDC`,
  actions: {
    approve: (role: string) => `Approve as ${role} reviewer`,
    hold: "Place hold",
    holdReason: "Reason for the hold",
    holdConfirm:
      "A hold blocks payment to the seller. Only a refund to the buyer is possible after it. Place it?",
    holdYes: "Yes, place the hold",
    holdNo: "Cancel",
    release: "Release payment to the seller",
    releaseNote: "Every required reviewer has signed. Anyone can submit the release; the program pays only the bound seller.",
  },
  status: {
    checking: "Checking the transaction with Solana devnet…",
    signing: "Approve the request in your wallet…",
    sent: "Sent. Waiting for confirmation on Solana devnet…",
    confirmed:
      "Confirmed on Solana devnet. The deal page updates when the Stream delivers it.",
    failed: "Not completed.",
    viewTx: "View on Solana Explorer",
    signature: "Signature",
  },
  /** Why an action is not available, in plain words. */
  blocked: {
    notReviewer: "This wallet isn't a reviewer on this deal.",
    alreadySigned: "You've already signed this deal.",
    held: "This deal is on hold, so it can't be approved or paid out.",
    notFunded: "This deal isn't funded yet.",
    settled: "This deal is already settled.",
  },
  errors: {
    rejected: "You declined the request in your wallet. Nothing was sent.",
    noFee: "Your wallet needs a little devnet SOL to pay the network fee.",
    timeout:
      "Solana devnet hasn't confirmed this yet. Check the Explorer link; it may still land.",
    6014: "This wallet isn't a reviewer on this deal.",
    6015: "This wallet reviews this deal, but not in that role.",
    6016: "You've already signed this deal.",
    6019: "This deal is on hold, so it can't be paid out.",
    6009: "This deal isn't open for that right now. It may not be funded yet, may be on hold, or may already be settled.",
    6018: "Not every required reviewer has signed yet.",
    6021: "The escrow doesn't hold the full amount, so it can't pay out.",
    program: (message: string) => `The escrow program refused it: ${message}`,
    unknown:
      "Solana devnet didn't accept the transaction. Try again in a moment.",
  },
};
