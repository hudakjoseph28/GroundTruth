import type {
  Check,
  CheckKind,
  CheckStatus,
  Deal,
  DealState,
  Parcel,
  ParcelReport,
  ResponsibleParty,
  Reviewer,
  Source,
  TimelineEvent,
} from "@groundtruth/shared";

import {
  CHECK_KINDS,
  CHECK_STATUSES,
  DEAL_STATES,
  goldenParcel,
  goldenReport,
  stagedDeal,
  GROUNDTRUTH_PROGRAM_ID,
  USDC_MINT_DEVNET,
  GROUNDTRUTH_ESCROW_IDL,
  ESCROW_INSTRUCTION_NAMES,
  ESCROW_EVENT_NAMES,
  getDealPdaSeeds,
  deriveDealPda,
  deriveVaultPda,
  deriveDealAccounts,
} from "@groundtruth/shared";

// Test escrow client helper with mock web3 context
class MockPublicKey {
  address: string;
  constructor(val: string | Uint8Array | number[]) {
    this.address = typeof val === "string" ? val : "mock-address";
  }
  toBytes(): Uint8Array {
    return new Uint8Array(32);
  }
  static findProgramAddressSync(): [MockPublicKey, number] {
    return [new MockPublicKey("mock-pda"), 255];
  }
}

const mockWeb3 = {
  PublicKey: MockPublicKey,
  getAssociatedTokenAddressSync(): MockPublicKey {
    return new MockPublicKey("mock-ata");
  },
};

const buyer = new mockWeb3.PublicKey("buyer-pubkey");
const seller = new mockWeb3.PublicKey("seller-pubkey");
const dealId = new Uint8Array(32);

const seeds = getDealPdaSeeds(buyer.toBytes(), dealId);
const [dealPda, bump] = deriveDealPda(buyer, dealId, mockWeb3);
const vaultPda = deriveVaultPda(dealPda, mockWeb3);
const accounts = deriveDealAccounts({
  buyer,
  seller,
  dealId,
  web3: mockWeb3,
});

void seeds;
void dealPda;
void bump;
void vaultPda;
void accounts;
void GROUNDTRUTH_PROGRAM_ID;
void USDC_MINT_DEVNET;
void GROUNDTRUTH_ESCROW_IDL;
void ESCROW_INSTRUCTION_NAMES;
void ESCROW_EVENT_NAMES;

type ContractSurface = {
  parcel: Parcel;
  check: Check;
  source: Source;
  party: ResponsibleParty;
  report: ParcelReport;
  deal: Deal;
  reviewer: Reviewer;
  event: TimelineEvent;
  kind: CheckKind;
  status: CheckStatus;
  state: DealState;
};

const kinds: readonly CheckKind[] = CHECK_KINDS;
const statuses: readonly CheckStatus[] = CHECK_STATUSES;
const states: readonly DealState[] = DEAL_STATES;

const surface = {
  parcel: goldenParcel,
  report: goldenReport,
  deal: stagedDeal,
  kind: kinds[0],
  status: statuses[2],
  state: states[0],
} satisfies Pick<
  ContractSurface,
  "parcel" | "report" | "deal" | "kind" | "status" | "state"
>;

void surface;
