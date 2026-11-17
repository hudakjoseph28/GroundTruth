import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  GROUNDTRUTH_PROGRAM_ID,
  USDC_MINT_DEVNET,
  DEAL_SEED,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getDealPdaSeeds,
  deriveDealPda,
  deriveVaultPda,
  deriveDealAccounts,
  GROUNDTRUTH_ESCROW_IDL,
  ESCROW_INSTRUCTION_NAMES,
  ESCROW_EVENT_NAMES,
} from "@groundtruth/shared";

const web3Context = {
  PublicKey,
  getAssociatedTokenAddressSync,
};

test("getDealPdaSeeds matches canonical Solana buffer seeds", () => {
  const buyer = new PublicKey("HcLJ8kbrJ3Jxk7oEf84ZGpR8czUr4U2x3jVJosXPgykM");
  const dealId = new Uint8Array(32).fill(7);

  const seeds = getDealPdaSeeds(buyer.toBytes(), dealId);
  assert.equal(seeds.length, 3);
  assert.deepEqual(Buffer.from(seeds[0]), Buffer.from(DEAL_SEED));
  assert.deepEqual(Buffer.from(seeds[1]), buyer.toBuffer());
  assert.deepEqual(Buffer.from(seeds[2]), Buffer.from(dealId));
});

test("deriveDealPda matches canonical PublicKey.findProgramAddressSync", () => {
  const buyer = new PublicKey("HcLJ8kbrJ3Jxk7oEf84ZGpR8czUr4U2x3jVJosXPgykM");
  const dealId = new Uint8Array(32).fill(42);
  const programId = new PublicKey(GROUNDTRUTH_PROGRAM_ID);

  const [derivedPda, derivedBump] = deriveDealPda(buyer, dealId, web3Context);

  const expectedSeeds = [
    Buffer.from("deal"),
    buyer.toBuffer(),
    Buffer.from(dealId),
  ];
  const [expectedPda, expectedBump] = PublicKey.findProgramAddressSync(
    expectedSeeds,
    programId
  );

  assert.equal(derivedPda.toBase58(), expectedPda.toBase58());
  assert.equal(derivedBump, expectedBump);
});

test("deriveVaultPda matches canonical getAssociatedTokenAddressSync with allowOwnerOffCurve=true", () => {
  const buyer = new PublicKey("HcLJ8kbrJ3Jxk7oEf84ZGpR8czUr4U2x3jVJosXPgykM");
  const dealId = new Uint8Array(32).fill(1);
  const [dealPda] = deriveDealPda(buyer, dealId, web3Context);
  const usdcMint = new PublicKey(USDC_MINT_DEVNET);

  const derivedVault = deriveVaultPda(dealPda, web3Context);
  const expectedVault = getAssociatedTokenAddressSync(
    usdcMint,
    dealPda,
    true
  );

  assert.equal(derivedVault.toBase58(), expectedVault.toBase58());
});

test("deriveDealAccounts derives all canonical PDAs, bumps, and ATAs correctly", () => {
  const buyer = Keypair.generate().publicKey;
  const seller = Keypair.generate().publicKey;
  const dealId = new Uint8Array(32);
  dealId[0] = 0xab;
  dealId[31] = 0xcd;

  const derived = deriveDealAccounts({
    buyer,
    seller,
    dealId,
    web3: web3Context,
  });

  const programId = new PublicKey(GROUNDTRUTH_PROGRAM_ID);
  const usdcMint = new PublicKey(USDC_MINT_DEVNET);

  // 1. Verify Deal PDA and Bump
  const [canonicalDealPda, canonicalBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), buyer.toBuffer(), Buffer.from(dealId)],
    programId
  );
  assert.equal(derived.dealPda.toBase58(), canonicalDealPda.toBase58());
  assert.equal(derived.dealBump, canonicalBump);

  // 2. Verify Vault ATA (must allow owner off-curve since Deal PDA is off curve)
  const canonicalVault = getAssociatedTokenAddressSync(
    usdcMint,
    canonicalDealPda,
    true
  );
  assert.equal(derived.vault.toBase58(), canonicalVault.toBase58());

  // 3. Verify Buyer ATA
  const canonicalBuyerAta = getAssociatedTokenAddressSync(
    usdcMint,
    buyer,
    false
  );
  assert.equal(derived.buyerTokenAccount.toBase58(), canonicalBuyerAta.toBase58());

  // 4. Verify Seller ATA
  const canonicalSellerAta = getAssociatedTokenAddressSync(
    usdcMint,
    seller,
    false
  );
  assert.equal(derived.sellerTokenAccount.toBase58(), canonicalSellerAta.toBase58());
});

test("deriveDealAccounts accepts custom mint and program ID", () => {
  const buyer = Keypair.generate().publicKey;
  const seller = Keypair.generate().publicKey;
  const dealId = new Uint8Array(32).fill(99);
  const customMint = new PublicKey("So11111111111111111111111111111111111111112");
  const customProgramId = new PublicKey("11111111111111111111111111111111");

  const derived = deriveDealAccounts({
    buyer,
    seller,
    dealId,
    mint: customMint,
    programId: customProgramId,
    web3: web3Context,
  });

  const [canonicalDealPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), buyer.toBuffer(), Buffer.from(dealId)],
    customProgramId
  );
  assert.equal(derived.dealPda.toBase58(), canonicalDealPda.toBase58());

  const canonicalVault = getAssociatedTokenAddressSync(
    customMint,
    canonicalDealPda,
    true
  );
  assert.equal(derived.vault.toBase58(), canonicalVault.toBase58());
});

test("deriveDealAccounts supports allowOwnerOffCurve for PDA participants", () => {
  const buyer = Keypair.generate().publicKey;
  const [pdaSeller] = PublicKey.findProgramAddressSync(
    [Buffer.from("multisig")],
    new PublicKey(GROUNDTRUTH_PROGRAM_ID)
  );
  const dealId = new Uint8Array(32).fill(3);

  const derived = deriveDealAccounts({
    buyer,
    seller: pdaSeller,
    dealId,
    allowOwnerOffCurve: true,
    web3: web3Context,
  });

  const canonicalSellerAta = getAssociatedTokenAddressSync(
    new PublicKey(USDC_MINT_DEVNET),
    pdaSeller,
    true
  );
  assert.equal(derived.sellerTokenAccount.toBase58(), canonicalSellerAta.toBase58());
});

test("escrow exports declare all 6 instructions and 6 events", () => {
  assert.equal(ESCROW_INSTRUCTION_NAMES.length, 6);
  assert.deepEqual([...ESCROW_INSTRUCTION_NAMES], [
    "initialize_deal",
    "fund",
    "sign_approval",
    "place_hold",
    "release",
    "refund",
  ]);

  assert.equal(ESCROW_EVENT_NAMES.length, 6);
  assert.deepEqual([...ESCROW_EVENT_NAMES], [
    "DealInitialized",
    "DealFunded",
    "ApprovalSigned",
    "HoldPlaced",
    "DealReleased",
    "DealRefunded",
  ]);

  assert.equal(GROUNDTRUTH_ESCROW_IDL.address, GROUNDTRUTH_PROGRAM_ID);
  assert.equal(ASSOCIATED_TOKEN_PROGRAM_ID, "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  assert.equal(TOKEN_PROGRAM_ID, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
});
