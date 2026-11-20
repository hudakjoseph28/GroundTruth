// A fake devnet for fee sponsorship tests: the deal account is the real
// Borsh layout (checked-in IDL coder); simulations answer what the test says.
import { Buffer } from "node:buffer";
import { BN, BorshCoder, web3, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  USDC_MINT_DEVNET,
  stagedDemoChainAccounts,
  stagedRehearsalV3Deal,
} from "@groundtruth/shared";
import {
  DEVNET_GENESIS_HASH,
  type Simulation,
  type SponsorChain,
} from "../../src/actions/devnetChain.js";

const coder = new BorshCoder(GROUNDTRUTH_ESCROW_IDL as unknown as Idl);
export const SPONSOR_DEAL = stagedRehearsalV3Deal;
export const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

type State = "Draft" | "Funded" | "Held" | "Released" | "Refunded";
type Role = "title" | "survey" | "septic";

export function dealAccount(
  options: {
    state?: State;
    approved?: Partial<Record<Role, boolean>>;
    /** Replace a reviewer's wallet (e.g. with the fee payer, to test refusal). */
    reviewerWallet?: Partial<Record<Role, string>>;
  } = {},
): Promise<Buffer> {
  const deal = SPONSOR_DEAL;
  const chain = stagedDemoChainAccounts[deal.id];
  const variant = (name: string) => ({ [name]: {} });
  return coder.accounts.encode("DealAccount", {
    deal_id: [...Buffer.from(chain.dealIdHex, "hex")],
    buyer: new web3.PublicKey(deal.buyerWallet),
    seller: new web3.PublicKey(deal.sellerWallet),
    seller_token_account: new web3.PublicKey(deal.sellerTokenAccount),
    mint: new web3.PublicKey(USDC_MINT_DEVNET),
    vault: new web3.PublicKey(chain.vault),
    amount: new BN(deal.amountBaseUnits),
    state: variant(options.state ?? "Funded"),
    reviewers: deal.reviewers.map((r) => ({
      wallet: new web3.PublicKey(options.reviewerWallet?.[r.role] ?? r.wallet),
      role: variant(r.role[0]!.toUpperCase() + r.role.slice(1)),
      required: r.required,
      approved: options.approved?.[r.role] ?? false,
    })),
    hold: null,
    bump: 255,
  });
}

export function fakeSponsorChain(
  options: {
    data?: Promise<Buffer>;
    genesis?: string;
    simulation?: Partial<Simulation>;
    fees?: number[];
  } = {},
): SponsorChain & { simulated: web3.VersionedTransaction[] } {
  const simulated: web3.VersionedTransaction[] = [];
  const data =
    options.data ?? dealAccount({ approved: { title: true, survey: true } });
  return {
    simulated,
    genesisHash: async () => options.genesis ?? DEVNET_GENESIS_HASH,
    account: async () => ({ owner: GROUNDTRUTH_PROGRAM_ID, data: await data }),
    latestBlockhash: async () => BLOCKHASH,
    blockhash: async () => ({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1_000,
    }),
    recentPriorityFees: async () =>
      (options.fees ?? []).map((prioritizationFee) => ({ prioritizationFee })),
    simulate: async (tx) => {
      simulated.push(tx);
      return {
        err: null,
        logs: [],
        unitsConsumed: 4_000,
        ...options.simulation,
      };
    },
  };
}
