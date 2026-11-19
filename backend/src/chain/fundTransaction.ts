import { BorshCoder, web3, type Idl } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  SOLANA_PAY_DEVNET_GENESIS_HASH,
  TOKEN_PROGRAM_ID,
  USDC_MINT_DEVNET,
  fundInstruction,
} from "@groundtruth/shared";

/**
 * The buyer's unsigned `fund` transaction for a Solana Pay transaction
 * request. The API reads public devnet state and builds the transaction; it
 * holds no key and signs nothing. The program still checks every rule when
 * the buyer's wallet sends it.
 */

/** The public devnet reads the builder needs. Tests pass a fake. */
export interface FundChain {
  genesisHash(): Promise<string>;
  /** Raw account, or null when nothing exists at the address. */
  account(address: string): Promise<{ owner: string; data: Uint8Array } | null>;
  latestBlockhash(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }>;
}

export const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

export function createFundChain(rpcUrl = DEFAULT_SOLANA_RPC_URL): FundChain {
  const connection = new web3.Connection(rpcUrl, "confirmed");
  return {
    genesisHash: () => connection.getGenesisHash(),
    account: async (address) => {
      const info = await connection.getAccountInfo(
        new web3.PublicKey(address),
        "confirmed",
      );
      return info ? { owner: info.owner.toBase58(), data: info.data } : null;
    },
    latestBlockhash: () => connection.getLatestBlockhash("confirmed"),
  };
}

/** The deal row fields the transaction is bound to. */
export interface FundableDeal {
  buyerWallet: string;
  sellerTokenAccount: string;
  amountBaseUnits: string;
  mint: string;
  escrowAddress: string;
}

/** Why the builder refused, in words a buyer's wallet can show. */
export type FundRefusal =
  | { kind: "notDevnet" }
  | { kind: "notInitialized" }
  | { kind: "notDraft"; chainState: string }
  | { kind: "mismatch"; field: string };

export type FundBuild =
  | { ok: true; transaction: string }
  | ({ ok: false } & FundRefusal);

const coder = new BorshCoder(GROUNDTRUTH_ESCROW_IDL as unknown as Idl);

/** The on-chain DealAccount, decoded with the checked-in IDL. */
interface ChainDeal {
  buyer: string;
  sellerTokenAccount: string;
  mint: string;
  vault: string;
  amount: string;
  state: string;
}

function decodeDeal(data: Uint8Array): ChainDeal {
  const raw = coder.accounts.decode("DealAccount", Buffer.from(data)) as {
    buyer: web3.PublicKey;
    seller_token_account: web3.PublicKey;
    mint: web3.PublicKey;
    vault: web3.PublicKey;
    amount: { toString(): string };
    state: Record<string, unknown>;
  };
  return {
    buyer: raw.buyer.toBase58(),
    sellerTokenAccount: raw.seller_token_account.toBase58(),
    mint: raw.mint.toBase58(),
    vault: raw.vault.toBase58(),
    amount: raw.amount.toString(),
    state: Object.keys(raw.state)[0] ?? "Unknown",
  };
}

/** The associated token account of `owner` for `mint` (the vault's owner is the deal PDA). */
export function associatedTokenAccount(owner: string, mint: string): string {
  return web3.PublicKey.findProgramAddressSync(
    [
      new web3.PublicKey(owner).toBuffer(),
      new web3.PublicKey(TOKEN_PROGRAM_ID).toBuffer(),
      new web3.PublicKey(mint).toBuffer(),
    ],
    new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0].toBase58();
}

/**
 * Checks the chain against the deal row (confirmed chain state wins), then
 * builds `fund` with the IDL's accounts. Fee payer is the buyer; the
 * signature slot is left empty for the buyer's wallet. RPC failures throw.
 */
export function createFundTransactionBuilder(chain: FundChain) {
  // Devnet's genesis hash never changes, so one good answer is enough.
  let devnetChecked = false;

  return async function buildFundTransaction(
    deal: FundableDeal,
  ): Promise<FundBuild> {
    if (!devnetChecked) {
      if ((await chain.genesisHash()) !== SOLANA_PAY_DEVNET_GENESIS_HASH) {
        return { ok: false, kind: "notDevnet" };
      }
      devnetChecked = true;
    }

    const account = await chain.account(deal.escrowAddress);
    if (!account) return { ok: false, kind: "notInitialized" };
    if (account.owner !== GROUNDTRUTH_PROGRAM_ID) {
      return { ok: false, kind: "mismatch", field: "owner" };
    }
    let onChain: ChainDeal;
    try {
      onChain = decodeDeal(account.data);
    } catch {
      return { ok: false, kind: "mismatch", field: "account" };
    }

    const expected: [string, string, string][] = [
      ["buyer", onChain.buyer, deal.buyerWallet],
      ["mint", onChain.mint, deal.mint],
      ["mint", onChain.mint, USDC_MINT_DEVNET],
      ["amount", onChain.amount, deal.amountBaseUnits],
      [
        "sellerTokenAccount",
        onChain.sellerTokenAccount,
        deal.sellerTokenAccount,
      ],
      [
        "vault",
        onChain.vault,
        associatedTokenAccount(deal.escrowAddress, onChain.mint),
      ],
    ];
    const differs = expected.find(([, chainValue, row]) => chainValue !== row);
    if (differs) return { ok: false, kind: "mismatch", field: differs[0] };
    if (onChain.state !== "Draft") {
      return { ok: false, kind: "notDraft", chainState: onChain.state };
    }

    const spec = fundInstruction({
      buyer: onChain.buyer,
      dealPda: deal.escrowAddress,
      buyerTokenAccount: associatedTokenAccount(onChain.buyer, onChain.mint),
      vault: onChain.vault,
      mint: onChain.mint,
    });
    const { blockhash, lastValidBlockHeight } = await chain.latestBlockhash();
    const transaction = new web3.Transaction({
      feePayer: new web3.PublicKey(onChain.buyer),
      blockhash,
      lastValidBlockHeight,
    }).add(
      new web3.TransactionInstruction({
        programId: new web3.PublicKey(spec.programId),
        keys: spec.keys.map((key) => ({
          ...key,
          pubkey: new web3.PublicKey(key.pubkey),
        })),
        data: Buffer.from(spec.data),
      }),
    );
    return {
      ok: true,
      transaction: transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
    };
  };
}
