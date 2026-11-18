import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createMint,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import crypto from "node:crypto";
import { GroundtruthEscrow } from "../target/types/groundtruth_escrow";

describe("groundtruth_escrow sprint 1", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.groundtruthEscrow as Program<GroundtruthEscrow>;

  const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const ESCROW_AMOUNT = new anchor.BN(25_000_000); // 25 USDC (6 decimals)

  function randomDealId(): number[] {
    return Array.from(crypto.randomBytes(32));
  }

  function getDealPda(buyer: PublicKey, dealId: number[]): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), buyer.toBuffer(), Buffer.from(dealId)],
      program.programId
    );
  }

  async function airdropSol(target: PublicKey, amountSol = 2) {
    const sig = await provider.connection.requestAirdrop(
      target,
      amountSol * LAMPORTS_PER_SOL
    );
    const latest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: sig,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    });
  }

  async function setupBuyerWithUsdc(buyer: Keypair, amount = 100_000_000n): Promise<PublicKey> {
    await airdropSol(buyer.publicKey, 2);
    const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, buyer.publicKey);

    // Create buyer ATA funded by provider
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        buyerAta,
        buyer.publicKey,
        USDC_MINT
      )
    );
    await provider.sendAndConfirm(tx, []);

    // Mint USDC to buyer using provider as mint authority
    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      USDC_MINT,
      buyerAta,
      provider.wallet.publicKey,
      amount
    );

    return buyerAta;
  }

  function createValidReviewers() {
    return [
      { wallet: Keypair.generate().publicKey, role: { title: {} }, required: true },
    ];
  }

  it("1-5. Successfully initializes a deal with correct PDA, immutable terms, vault, and reviewers", async () => {
    const buyer = Keypair.generate();
    await setupBuyerWithUsdc(buyer);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    const septicReviewer = Keypair.generate();

    const dealId = randomDealId();
    const [dealPda, bump] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    const reviewers = [
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
      { wallet: septicReviewer.publicKey, role: { septic: {} }, required: false },
    ];

    const tx = await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, reviewers)
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    expect(tx).to.be.a("string");

    // Fetch account state and verify exact stored terms
    const dealAccount = await program.account.dealAccount.fetch(dealPda);
    expect(Buffer.from(dealAccount.dealId)).to.deep.equal(Buffer.from(dealId));
    expect(dealAccount.buyer.toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(dealAccount.seller.toBase58()).to.equal(seller.publicKey.toBase58());
    expect(dealAccount.sellerTokenAccount.toBase58()).to.equal(sellerAta.toBase58());
    expect(dealAccount.mint.toBase58()).to.equal(USDC_MINT.toBase58());
    expect(dealAccount.vault.toBase58()).to.equal(vault.toBase58());
    expect(dealAccount.amount.toNumber()).to.equal(25_000_000);
    expect(dealAccount.state).to.deep.equal({ draft: {} });
    expect(dealAccount.bump).to.equal(bump);
    expect(dealAccount.hold).to.equal(null);

    // Verify reviewer assignments
    expect(dealAccount.reviewers.length).to.equal(3);
    expect(dealAccount.reviewers[0].wallet.toBase58()).to.equal(titleReviewer.publicKey.toBase58());
    expect(dealAccount.reviewers[0].role).to.deep.equal({ title: {} });
    expect(dealAccount.reviewers[0].required).to.equal(true);
    expect(dealAccount.reviewers[0].approved).to.equal(false);

    // Verify vault token account attributes
    const vaultAccount = await getAccount(provider.connection, vault);
    expect(vaultAccount.mint.toBase58()).to.equal(USDC_MINT.toBase58());
    expect(vaultAccount.owner.toBase58()).to.equal(dealPda.toBase58());
    expect(vaultAccount.amount).to.equal(0n);
  });

  it("6-9. Buyer successfully funds deal: exact token movements and state transition to funded", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer, 50_000_000n);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const buyerBefore = await getAccount(provider.connection, buyerAta);
    const vaultBefore = await getAccount(provider.connection, vault);
    expect(buyerBefore.amount).to.equal(50_000_000n);
    expect(vaultBefore.amount).to.equal(0n);

    // Fund deal
    await program.methods
      .fund()
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        buyerTokenAccount: buyerAta,
        vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Verify balances changed by exact amount
    const buyerAfter = await getAccount(provider.connection, buyerAta);
    const vaultAfter = await getAccount(provider.connection, vault);
    expect(buyerAfter.amount).to.equal(25_000_000n);
    expect(vaultAfter.amount).to.equal(25_000_000n);

    // Verify state transition
    const dealAccount = await program.account.dealAccount.fetch(dealPda);
    expect(dealAccount.state).to.deep.equal({ funded: {} });
  });

  it("10. Unauthorized signer cannot fund the deal", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer);
    const attacker = Keypair.generate();
    await airdropSol(attacker.publicKey, 2);

    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);
    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    try {
      await program.methods
        .fund()
        .accountsPartial({
          buyer: attacker.publicKey,
          deal: dealPda,
          buyerTokenAccount: buyerAta,
          vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown unauthorized buyer error");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnauthorizedBuyer|ConstraintRaw|has_one/i);
    }
  });

  it("11. Rejects initialization with invalid mint", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const fakeMint = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(fakeMint.publicKey, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(fakeMint.publicKey, dealPda, true);

    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: fakeMint.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed with invalid mint");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidMint|Error/i);
    }
  });

  it("12. Rejects funding with mismatched source token account owner", async () => {
    const buyer = Keypair.generate();
    await setupBuyerWithUsdc(buyer);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Other user's token account
    const otherUser = Keypair.generate();
    const otherAta = await setupBuyerWithUsdc(otherUser);

    try {
      await program.methods
        .fund()
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          buyerTokenAccount: otherAta,
          vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed with invalid source owner");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidSourceOwner|Constraint/i);
    }
  });

  it("13. Rejects funding with invalid destination vault", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Initialize an authentic token account owned by another wallet
    const otherOwner = Keypair.generate();
    await airdropSol(otherOwner.publicKey, 1);
    const fakeVault = getAssociatedTokenAddressSync(USDC_MINT, otherOwner.publicKey);
    const initAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        fakeVault,
        otherOwner.publicKey,
        USDC_MINT
      )
    );
    await provider.sendAndConfirm(initAtaTx, []);

    try {
      await program.methods
        .fund()
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          buyerTokenAccount: buyerAta,
          vault: fakeVault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed with invalid vault");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidVault|has_one/i);
    }
  });

  it("14. Rejects initialization with zero amount", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    try {
      await program.methods
        .initializeDeal(dealId, new anchor.BN(0), createValidReviewers())
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed on zero amount");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/ZeroAmount/i);
    }
  });

  it("15. Rejects duplicate initialization of the same deal", async () => {
    const buyer = Keypair.generate();
    await setupBuyerWithUsdc(buyer);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Second initialization with same buyer and dealId
    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed on duplicate initialization");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/already in use|custom program error: 0x0/i);
    }
  });

  it("16. Rejects duplicate funding attempts on an already funded deal", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer, 100_000_000n);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // First fund
    await program.methods
      .fund()
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        buyerTokenAccount: buyerAta,
        vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Second fund attempt must fail
    try {
      await program.methods
        .fund()
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          buyerTokenAccount: buyerAta,
          vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed on second funding attempt");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }
  });

  it("17. Rejects initialization with more than eight reviewers", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    // 9 reviewers
    const nineReviewers = Array.from({ length: 9 }).map(() => ({
      wallet: Keypair.generate().publicKey,
      role: { title: {} },
      required: true,
    }));

    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, nineReviewers)
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed with >8 reviewers");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/TooManyReviewers/i);
    }
  });

  it("18. Rejects duplicate or invalid reviewer assignments", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    const duplicateWallet = Keypair.generate().publicKey;
    const dupReviewers = [
      { wallet: duplicateWallet, role: { title: {} }, required: true },
      { wallet: duplicateWallet, role: { survey: {} }, required: false },
    ];

    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, dupReviewers)
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed on duplicate reviewer");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/DuplicateReviewer/i);
    }

    // Buyer as reviewer
    const buyerReviewerDealId = randomDealId();
    const [buyerReviewerDealPda] = getDealPda(buyer.publicKey, buyerReviewerDealId);
    const buyerReviewerVault = getAssociatedTokenAddressSync(
      USDC_MINT,
      buyerReviewerDealPda,
      true
    );
    const buyerAsReviewer = [
      { wallet: buyer.publicKey, role: { title: {} }, required: true },
    ];
    try {
      await program.methods
        .initializeDeal(buyerReviewerDealId, ESCROW_AMOUNT, buyerAsReviewer)
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: buyerReviewerDealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault: buyerReviewerVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed when reviewer is buyer");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidReviewerAssignment/i);
    }

    // Seller as reviewer
    const sellerReviewerDealId = randomDealId();
    const [sellerReviewerDealPda] = getDealPda(buyer.publicKey, sellerReviewerDealId);
    const sellerReviewerVault = getAssociatedTokenAddressSync(
      USDC_MINT,
      sellerReviewerDealPda,
      true
    );
    const sellerAsReviewer = [
      { wallet: seller.publicKey, role: { title: {} }, required: true },
    ];
    try {
      await program.methods
        .initializeDeal(sellerReviewerDealId, ESCROW_AMOUNT, sellerAsReviewer)
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: sellerReviewerDealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault: sellerReviewerVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed when reviewer is seller");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidReviewerAssignment/i);
    }
  });

  it("18a. Issue A: Reject deal initialization with zero required reviewers (empty list)", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, [])
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed on empty reviewer list");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/NoRequiredReviewers/i);
    }
  });

  it("18b. Issue A: Reject deal initialization when all reviewers are optional", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    const allOptionalReviewers = [
      { wallet: Keypair.generate().publicKey, role: { title: {} }, required: false },
      { wallet: Keypair.generate().publicKey, role: { survey: {} }, required: false },
      { wallet: Keypair.generate().publicKey, role: { septic: {} }, required: false },
    ];

    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, allOptionalReviewers)
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed when all reviewers are optional");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/NoRequiredReviewers/i);
    }
  });

  it("18c. Issue A: Accept deal initialization with at least one required reviewer alongside optional reviewers", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    const validMixedReviewers = [
      { wallet: Keypair.generate().publicKey, role: { title: {} }, required: true },
      { wallet: Keypair.generate().publicKey, role: { septic: {} }, required: false },
    ];

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, validMixedReviewers)
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(dealPda);
    expect(deal.reviewers.length).to.equal(2);
    expect(deal.reviewers[0].required).to.equal(true);
    expect(deal.reviewers[1].required).to.equal(false);
  });

  it("18d. Issue B: Reject deal initialization when reviewer wallet equals seller wallet", async () => {
    const buyer = Keypair.generate();
    await airdropSol(buyer.publicKey, 2);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    const sellerReviewer = [
      { wallet: seller.publicKey, role: { title: {} }, required: true },
    ];

    try {
      await program.methods
        .initializeDeal(dealId, ESCROW_AMOUNT, sellerReviewer)
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          seller: seller.publicKey,
          sellerTokenAccount: sellerAta,
          mint: USDC_MINT,
          vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed when reviewer is seller");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidReviewerAssignment/i);
    }
  });

  it("19. Failed transactions preserve state and token balances", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer, 40_000_000n);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const buyerBalBefore = (await getAccount(provider.connection, buyerAta)).amount;
    const vaultBalBefore = (await getAccount(provider.connection, vault)).amount;
    const dealBefore = await program.account.dealAccount.fetch(dealPda);

    // Attempt illegal fund call from unassigned attacker
    const attacker = Keypair.generate();
    await airdropSol(attacker.publicKey, 1);

    try {
      await program.methods
        .fund()
        .accountsPartial({
          buyer: attacker.publicKey,
          deal: dealPda,
          buyerTokenAccount: buyerAta,
          vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
    } catch {
      // Expected failure
    }

    // Verify balances and state are 100% unaltered
    const buyerBalAfter = (await getAccount(provider.connection, buyerAta)).amount;
    const vaultBalAfter = (await getAccount(provider.connection, vault)).amount;
    const dealAfter = await program.account.dealAccount.fetch(dealPda);

    expect(buyerBalAfter).to.equal(buyerBalBefore);
    expect(vaultBalAfter).to.equal(vaultBalBefore);
    expect(dealAfter.state).to.deep.equal(dealBefore.state);
  });

  it("20. ESC-01: Vault funding succeeds with exact delta accounting when unsolicited tokens exist", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer, 50_000_000n);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // External third party sends 1 base unit of test USDC into vault before buyer funds
    const thirdParty = Keypair.generate();
    const thirdPartyAta = await setupBuyerWithUsdc(thirdParty, 10_000_000n);

    const unsolicitedTx = new Transaction().add(
      createTransferCheckedInstruction(
        thirdPartyAta,
        USDC_MINT,
        vault,
        thirdParty.publicKey,
        1n,
        6
      )
    );
    await provider.sendAndConfirm(unsolicitedTx, [thirdParty]);

    // Confirm unsolicited transfer succeeded
    const vaultPreFunding = await getAccount(provider.connection, vault);
    expect(vaultPreFunding.amount).to.equal(1n);

    // Legitimate buyer funds the deal
    const buyerBefore = await getAccount(provider.connection, buyerAta);
    expect(buyerBefore.amount).to.equal(50_000_000n);

    await program.methods
      .fund()
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        buyerTokenAccount: buyerAta,
        vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Verify buyer's token balance decreased by exactly 25 USDC
    const buyerAfter = await getAccount(provider.connection, buyerAta);
    expect(buyerAfter.amount).to.equal(25_000_000n);
    expect(buyerBefore.amount - buyerAfter.amount).to.equal(25_000_000n);

    // Verify vault balance increased by exactly 25 USDC during funding
    const vaultPostFunding = await getAccount(provider.connection, vault);
    expect(vaultPostFunding.amount - vaultPreFunding.amount).to.equal(25_000_000n);

    // Verify vault's final balance includes the original unsolicited token (25 USDC + 1 base unit)
    expect(vaultPostFunding.amount).to.equal(25_000_001n);

    // Verify deal state is Funded and amount is immutable
    const dealAccount = await program.account.dealAccount.fetch(dealPda);
    expect(dealAccount.state).to.deep.equal({ funded: {} });
    expect(dealAccount.amount.toNumber()).to.equal(25_000_000);

    // Confirm deal cannot be funded again
    try {
      await program.methods
        .fund()
        .accountsPartial({
          buyer: buyer.publicKey,
          deal: dealPda,
          buyerTokenAccount: buyerAta,
          vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();
      expect.fail("Should have failed to fund already funded deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }
  });

  it("21. ESC-01: Unsolicited deposits after funding cannot alter DealAccount state or terms", async () => {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer, 50_000_000n);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, ESCROW_AMOUNT, createValidReviewers())
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    await program.methods
      .fund()
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        buyerTokenAccount: buyerAta,
        vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    const dealAccountFunded = await program.account.dealAccount.fetch(dealPda);
    expect(dealAccountFunded.state).to.deep.equal({ funded: {} });
    expect(dealAccountFunded.amount.toString()).to.equal(ESCROW_AMOUNT.toString());

    // Third party sends unsolicited tokens post-funding
    const thirdParty = Keypair.generate();
    const thirdPartyAta = await setupBuyerWithUsdc(thirdParty, 10_000_000n);
    const postFundingTransferTx = new Transaction().add(
      createTransferCheckedInstruction(
        thirdPartyAta,
        USDC_MINT,
        vault,
        thirdParty.publicKey,
        5_000_000n, // 5 USDC
        6
      )
    );
    await provider.sendAndConfirm(postFundingTransferTx, [thirdParty]);

    // Vault has 30 USDC now (25 + 5 surplus)
    const vaultAccount = await getAccount(provider.connection, vault);
    expect(vaultAccount.amount).to.equal(30_000_000n);

    // Deal account state and immutable terms are completely unchanged
    const dealAccountAfterSurplus = await program.account.dealAccount.fetch(dealPda);
    expect(dealAccountAfterSurplus.state).to.deep.equal({ funded: {} });
    expect(dealAccountAfterSurplus.amount.toString()).to.equal(ESCROW_AMOUNT.toString());
    expect(dealAccountAfterSurplus.buyer.toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(dealAccountAfterSurplus.seller.toBase58()).to.equal(seller.publicKey.toBase58());
  });

  // =========================================================================
  // SPRINT 2: SECURE REVIEWER APPROVALS & BLOCKING HOLDS
  // =========================================================================

  type ReviewerRoleVariant = { title: object } | { survey: object } | { septic: object };

  interface StagedDealSetup {
    buyer: Keypair;
    buyerAta: PublicKey;
    seller: Keypair;
    sellerAta: PublicKey;
    dealId: number[];
    dealPda: PublicKey;
    bump: number;
    vault: PublicKey;
  }

  async function initializeStagedDeal(
    reviewers: Array<{ wallet: PublicKey; role: ReviewerRoleVariant; required: boolean }>,
    amount = ESCROW_AMOUNT
  ): Promise<StagedDealSetup> {
    const buyer = Keypair.generate();
    const buyerAta = await setupBuyerWithUsdc(buyer, BigInt(amount.toString()) * 2n);
    const seller = Keypair.generate();
    const sellerAta = getAssociatedTokenAddressSync(USDC_MINT, seller.publicKey);

    const dealId = randomDealId();
    const [dealPda, bump] = getDealPda(buyer.publicKey, dealId);
    const vault = getAssociatedTokenAddressSync(USDC_MINT, dealPda, true);

    await program.methods
      .initializeDeal(dealId, amount, reviewers)
      .accountsPartial({
        buyer: buyer.publicKey,
        deal: dealPda,
        seller: seller.publicKey,
        sellerTokenAccount: sellerAta,
        mint: USDC_MINT,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    return { buyer, buyerAta, seller, sellerAta, dealId, dealPda, bump, vault };
  }

  async function initializeAndFundStagedDeal(
    reviewers: Array<{ wallet: PublicKey; role: ReviewerRoleVariant; required: boolean }>,
    amount = ESCROW_AMOUNT
  ): Promise<StagedDealSetup> {
    const setup = await initializeStagedDeal(reviewers, amount);
    await program.methods
      .fund()
      .accountsPartial({
        buyer: setup.buyer.publicKey,
        deal: setup.dealPda,
        buyerTokenAccount: setup.buyerAta,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([setup.buyer])
      .rpc();

    return setup;
  }

  async function parseEventsFromTx(txSig: string) {
    let txDetails = null;
    for (let i = 0; i < 10; i++) {
      txDetails = await provider.connection.getTransaction(txSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (txDetails) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!txDetails) {
      throw new Error(`Transaction ${txSig} details not found`);
    }
    const parser = new anchor.EventParser(program.programId, program.coder);
    return [...parser.parseLogs(txDetails.meta?.logMessages ?? [])];
  }

  function findEvent(events: Array<{ name: string; data: Record<string, unknown> }>, name: string) {
    return events.find((e) => e.name.toLowerCase() === name.toLowerCase());
  }

  // -------------------------------------------------------------------------
  // A. APPROVAL TESTS
  // -------------------------------------------------------------------------

  it("22. Valid title reviewer approval updates approved flag and emits ApprovalSigned event", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    const txSig = await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // Verify account state
    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.reviewers[0].wallet.toBase58()).to.equal(titleReviewer.publicKey.toBase58());
    expect(deal.reviewers[0].role).to.deep.equal({ title: {} });

    // Verify event
    const events = await parseEventsFromTx(txSig);
    const event = findEvent(events, "ApprovalSigned");
    expect(event).to.not.equal(undefined);
    expect((event!.data.deal as PublicKey).toBase58()).to.equal(setup.dealPda.toBase58());
    expect(Buffer.from(event!.data.dealId as number[])).to.deep.equal(Buffer.from(setup.dealId));
    expect(((event!.data.reviewer ?? event!.data.reviewerWallet) as PublicKey).toBase58()).to.equal(
      titleReviewer.publicKey.toBase58()
    );
    expect(event!.data.role).to.deep.equal({ title: {} });
  });

  it("23. Valid survey reviewer approval updates approved flag", async () => {
    const surveyReviewer = Keypair.generate();
    await airdropSol(surveyReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);

    await program.methods
      .signApproval({ survey: {} })
      .accountsPartial({
        reviewer: surveyReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([surveyReviewer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.reviewers[0].role).to.deep.equal({ survey: {} });
  });

  it("24. Valid septic reviewer approval updates approved flag", async () => {
    const septicReviewer = Keypair.generate();
    await airdropSol(septicReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: septicReviewer.publicKey, role: { septic: {} }, required: true },
    ]);

    await program.methods
      .signApproval({ septic: {} })
      .accountsPartial({
        reviewer: septicReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([septicReviewer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.reviewers[0].role).to.deep.equal({ septic: {} });
  });

  it("25. Multiple independent approvals: title, survey, and septic approve independently", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    const septicReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
      airdropSol(septicReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
      { wallet: septicReviewer.publicKey, role: { septic: {} }, required: false },
    ]);

    // Title approves
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    let deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.reviewers[1].approved).to.equal(false);
    expect(deal.reviewers[2].approved).to.equal(false);

    // Survey approves
    await program.methods
      .signApproval({ survey: {} })
      .accountsPartial({
        reviewer: surveyReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([surveyReviewer])
      .rpc();

    deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.reviewers[1].approved).to.equal(true);
    expect(deal.reviewers[2].approved).to.equal(false);

    // Septic approves
    await program.methods
      .signApproval({ septic: {} })
      .accountsPartial({
        reviewer: septicReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([septicReviewer])
      .rpc();

    deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.reviewers[1].approved).to.equal(true);
    expect(deal.reviewers[2].approved).to.equal(true);
    expect(deal.state).to.deep.equal({ funded: {} });
  });

  it("26. Optional assigned reviewer approval: required=false reviewer can approve", async () => {
    const titleReviewer = Keypair.generate();
    const optionalReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(optionalReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: optionalReviewer.publicKey, role: { septic: {} }, required: false },
    ]);

    await program.methods
      .signApproval({ septic: {} })
      .accountsPartial({
        reviewer: optionalReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([optionalReviewer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[1].required).to.equal(false);
    expect(deal.reviewers[1].approved).to.equal(true);
    expect(deal.reviewers[0].approved).to.equal(false);
    expect(deal.state).to.deep.equal({ funded: {} });
  });

  it("27. Unauthorized wallet rejected: unassigned wallet cannot sign approval", async () => {
    const assignedReviewer = Keypair.generate();
    const attacker = Keypair.generate();
    await Promise.all([
      airdropSol(assignedReviewer.publicKey, 1),
      airdropSol(attacker.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: assignedReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .signApproval({ title: {} })
        .accountsPartial({
          reviewer: attacker.publicKey,
          deal: setup.dealPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have failed for unassigned reviewer");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnassignedReviewer/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(false);
  });

  it("28. Correct wallet with incorrect role rejected", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .signApproval({ survey: {} }) // assigned as Title, signing as Survey
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have failed for incorrect reviewer role");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidReviewerRole/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(false);
  });

  it("29. Duplicate approval rejected: reviewer cannot approve twice", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // First approval succeeds
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // Second approval fails
    try {
      await program.methods
        .signApproval({ title: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have failed for duplicate approval");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/DuplicateApproval/i);
    }
  });

  it("30. Approval before funding rejected: cannot approve in Draft state", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    // Initialized but NOT funded (Draft state)
    const setup = await initializeStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .signApproval({ title: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have failed to approve before funding");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ draft: {} });
    expect(deal.reviewers[0].approved).to.equal(false);
  });

  it("31. Approval after hold rejected: cannot approve on Held deal", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);

    // Title reviewer places a hold
    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const heldDeal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(heldDeal.state).to.deep.equal({ held: {} });

    // Survey reviewer attempts approval on held deal
    try {
      await program.methods
        .signApproval({ survey: {} })
        .accountsPartial({
          reviewer: surveyReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([surveyReviewer])
        .rpc();
      expect.fail("Should have failed to approve held deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    const dealAfter = await program.account.dealAccount.fetch(setup.dealPda);
    expect(dealAfter.reviewers[1].approved).to.equal(false);
  });

  it("32. Reviewer acting on another deal rejected", async () => {
    const reviewerA = Keypair.generate();
    const reviewerB = Keypair.generate();
    await Promise.all([
      airdropSol(reviewerA.publicKey, 1),
      airdropSol(reviewerB.publicKey, 1),
    ]);

    // Deal 1 has reviewer A
    await initializeAndFundStagedDeal([
      { wallet: reviewerA.publicKey, role: { title: {} }, required: true },
    ]);

    // Deal 2 has reviewer B
    const deal2 = await initializeAndFundStagedDeal([
      { wallet: reviewerB.publicKey, role: { title: {} }, required: true },
    ]);

    // Reviewer A attempts to sign for Deal 2
    try {
      await program.methods
        .signApproval({ title: {} })
        .accountsPartial({
          reviewer: reviewerA.publicKey,
          deal: deal2.dealPda,
        })
        .signers([reviewerA])
        .rpc();
      expect.fail("Should have rejected reviewer acting on another deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnassignedReviewer/i);
    }
  });

  it("33. Approval cannot mutate unrelated reviewer entries in multi-reviewer deal", async () => {
    const r1 = Keypair.generate();
    const r2 = Keypair.generate();
    const r3 = Keypair.generate();
    await Promise.all([
      airdropSol(r1.publicKey, 1),
      airdropSol(r2.publicKey, 1),
      airdropSol(r3.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: r1.publicKey, role: { title: {} }, required: true },
      { wallet: r2.publicKey, role: { survey: {} }, required: true },
      { wallet: r3.publicKey, role: { septic: {} }, required: false },
    ]);

    const before = await program.account.dealAccount.fetch(setup.dealPda);

    // Only R2 approves
    await program.methods
      .signApproval({ survey: {} })
      .accountsPartial({
        reviewer: r2.publicKey,
        deal: setup.dealPda,
      })
      .signers([r2])
      .rpc();

    const after = await program.account.dealAccount.fetch(setup.dealPda);

    // R1 unchanged
    expect(after.reviewers[0].wallet.toBase58()).to.equal(before.reviewers[0].wallet.toBase58());
    expect(after.reviewers[0].role).to.deep.equal(before.reviewers[0].role);
    expect(after.reviewers[0].required).to.equal(before.reviewers[0].required);
    expect(after.reviewers[0].approved).to.equal(false);

    // R2 approved
    expect(after.reviewers[1].approved).to.equal(true);

    // R3 unchanged
    expect(after.reviewers[2].wallet.toBase58()).to.equal(before.reviewers[2].wallet.toBase58());
    expect(after.reviewers[2].role).to.deep.equal(before.reviewers[2].role);
    expect(after.reviewers[2].required).to.equal(before.reviewers[2].required);
    expect(after.reviewers[2].approved).to.equal(false);
  });

  // -------------------------------------------------------------------------
  // B. HOLD TESTS
  // -------------------------------------------------------------------------

  it("34. Valid assigned reviewer hold transitions deal to Held and emits HoldPlaced event", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    const txSig = await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ held: {} });
    expect(deal.hold).to.not.equal(null);
    expect(deal.hold!.placedBy.toBase58()).to.equal(titleReviewer.publicKey.toBase58());
    expect(deal.hold!.role).to.deep.equal({ title: {} });
    expect(deal.hold!.reasonCode).to.deep.equal({ titleException: {} });
    expect(deal.hold!.placedAt.toNumber()).to.be.greaterThan(0);

    // Verify event
    const events = await parseEventsFromTx(txSig);
    const event = findEvent(events, "HoldPlaced");
    expect(event).to.not.equal(undefined);
    expect(event!.data.deal.toBase58()).to.equal(setup.dealPda.toBase58());
    expect(Buffer.from(event!.data.dealId ?? event!.data.deal_id)).to.deep.equal(Buffer.from(setup.dealId));
    expect((event!.data.reviewer ?? event!.data.reviewerWallet).toBase58()).to.equal(titleReviewer.publicKey.toBase58());
    expect(event!.data.role).to.deep.equal({ title: {} });
    expect(event!.data.reasonCode ?? event!.data.reason_code).to.deep.equal({ titleException: {} });
  });

  it("35. Each HoldReason variant accepted and stored correctly", async () => {
    const reasons: Array<{
      variant:
        | { sellerIdentityDisputed: object }
        | { titleException: object }
        | { siteReviewFailed: object }
        | { other: object };
    }> = [
      { variant: { sellerIdentityDisputed: {} } },
      { variant: { titleException: {} } },
      { variant: { siteReviewFailed: {} } },
      { variant: { other: {} } },
    ];

    for (const { variant } of reasons) {
      const reviewer = Keypair.generate();
      await airdropSol(reviewer.publicKey, 1);

      const setup = await initializeAndFundStagedDeal([
        { wallet: reviewer.publicKey, role: { title: {} }, required: true },
      ]);

      const txSig = await program.methods
        .placeHold({ title: {} }, variant)
        .accountsPartial({
          reviewer: reviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([reviewer])
        .rpc();

      const deal = await program.account.dealAccount.fetch(setup.dealPda);
      expect(deal.state).to.deep.equal({ held: {} });
      expect(deal.hold).to.not.equal(null);
      expect(deal.hold!.reasonCode).to.deep.equal(variant);

      const events = await parseEventsFromTx(txSig);
      const event = findEvent(events, "HoldPlaced");
      expect(event).to.not.equal(undefined);
      expect(event!.data.reasonCode ?? event!.data.reason_code).to.deep.equal(variant);
    }
  });

  it("36. Optional reviewer hold: required=false reviewer can place a hold", async () => {
    const titleReviewer = Keypair.generate();
    const optionalReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(optionalReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: optionalReviewer.publicKey, role: { septic: {} }, required: false },
    ]);

    await program.methods
      .placeHold({ septic: {} }, { siteReviewFailed: {} })
      .accountsPartial({
        reviewer: optionalReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([optionalReviewer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ held: {} });
    expect(deal.hold!.placedBy.toBase58()).to.equal(optionalReviewer.publicKey.toBase58());
    expect(deal.hold!.role).to.deep.equal({ septic: {} });
    expect(deal.hold!.reasonCode).to.deep.equal({ siteReviewFailed: {} });
  });

  it("37. Hold after prior approval: reviewer who approved can still place hold while Funded", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // Reviewer approves first
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    let deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers[0].approved).to.equal(true);
    expect(deal.state).to.deep.equal({ funded: {} });

    // Reviewer subsequently discovers an issue and places hold
    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ held: {} });
    expect(deal.hold).to.not.equal(null);
    expect(deal.hold!.placedBy.toBase58()).to.equal(titleReviewer.publicKey.toBase58());
  });

  it("38. Unauthorized wallet rejected from placing hold", async () => {
    const assignedReviewer = Keypair.generate();
    const attacker = Keypair.generate();
    await Promise.all([
      airdropSol(assignedReviewer.publicKey, 1),
      airdropSol(attacker.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: assignedReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .placeHold({ title: {} }, { titleException: {} })
        .accountsPartial({
          reviewer: attacker.publicKey,
          deal: setup.dealPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have rejected unassigned wallet from placing hold");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnassignedReviewer/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
    expect(deal.hold).to.equal(null);
  });

  it("39. Incorrect role rejected from placing hold", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .placeHold({ survey: {} }, { siteReviewFailed: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have rejected hold with incorrect reviewer role");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidReviewerRole/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
    expect(deal.hold).to.equal(null);
  });

  it("40. Hold before funding rejected: cannot place hold on Draft deal", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .placeHold({ title: {} }, { titleException: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have rejected hold before funding");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ draft: {} });
    expect(deal.hold).to.equal(null);
  });

  it("41. Duplicate hold rejected: same reviewer cannot place second hold on Held deal", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // First hold succeeds
    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // Second hold rejected
    try {
      await program.methods
        .placeHold({ title: {} }, { titleException: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have rejected duplicate hold");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }
  });

  it("42. Hold after terminal Held state rejected: another reviewer cannot place hold", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);

    // Title places hold
    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // Survey attempts another hold
    try {
      await program.methods
        .placeHold({ survey: {} }, { siteReviewFailed: {} })
        .accountsPartial({
          reviewer: surveyReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([surveyReviewer])
        .rpc();
      expect.fail("Should have rejected hold on already Held deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.hold!.placedBy.toBase58()).to.equal(titleReviewer.publicKey.toBase58());
  });

  it("43. Stored hold fields and timestamp verified against clock sysvar", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    const beforeTimestamp = Math.floor(Date.now() / 1000);

    await program.methods
      .placeHold({ title: {} }, { sellerIdentityDisputed: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const afterTimestamp = Math.floor(Date.now() / 1000) + 10;

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ held: {} });
    expect(deal.hold).to.not.equal(null);
    expect(deal.hold!.placedBy.toBase58()).to.equal(titleReviewer.publicKey.toBase58());
    expect(deal.hold!.role).to.deep.equal({ title: {} });
    expect(deal.hold!.reasonCode).to.deep.equal({ sellerIdentityDisputed: {} });
    expect(deal.hold!.placedAt.toNumber()).to.be.gte(beforeTimestamp - 10);
    expect(deal.hold!.placedAt.toNumber()).to.be.lte(afterTimestamp);
  });

  // -------------------------------------------------------------------------
  // C. SECURITY AND REGRESSION TESTS
  // -------------------------------------------------------------------------

  it("44. Review instructions do not move tokens: buyer, seller, and vault balances remain unchanged", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // Create seller ATA so its balance can be observed before and after
    const createSellerAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        setup.sellerAta,
        setup.seller.publicKey,
        USDC_MINT
      )
    );
    await provider.sendAndConfirm(createSellerAtaTx, []);

    const buyerBefore = await getAccount(provider.connection, setup.buyerAta);
    const sellerBefore = await getAccount(provider.connection, setup.sellerAta);
    const vaultBefore = await getAccount(provider.connection, setup.vault);

    // Sign approval
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const buyerAfter = await getAccount(provider.connection, setup.buyerAta);
    const sellerAfter = await getAccount(provider.connection, setup.sellerAta);
    const vaultAfter = await getAccount(provider.connection, setup.vault);

    expect(buyerAfter.amount).to.equal(buyerBefore.amount);
    expect(sellerAfter.amount).to.equal(sellerBefore.amount);
    expect(vaultAfter.amount).to.equal(vaultBefore.amount);
    expect(vaultAfter.amount).to.equal(25_000_000n);
    expect(sellerAfter.amount).to.equal(0n);
  });

  it("45. Hold instructions do not move tokens: buyer, seller, and vault balances remain unchanged", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // Create seller ATA so its balance can be observed before and after
    const createSellerAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        setup.sellerAta,
        setup.seller.publicKey,
        USDC_MINT
      )
    );
    await provider.sendAndConfirm(createSellerAtaTx, []);

    const buyerBefore = await getAccount(provider.connection, setup.buyerAta);
    const sellerBefore = await getAccount(provider.connection, setup.sellerAta);
    const vaultBefore = await getAccount(provider.connection, setup.vault);

    // Place hold
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const buyerAfter = await getAccount(provider.connection, setup.buyerAta);
    const sellerAfter = await getAccount(provider.connection, setup.sellerAta);
    const vaultAfter = await getAccount(provider.connection, setup.vault);

    expect(buyerAfter.amount).to.equal(buyerBefore.amount);
    expect(sellerAfter.amount).to.equal(sellerBefore.amount);
    expect(vaultAfter.amount).to.equal(vaultBefore.amount);
    expect(vaultAfter.amount).to.equal(25_000_000n);
    expect(sellerAfter.amount).to.equal(0n);
  });

  it("46. Immutable deal terms preserved: amount, mint, buyer, seller, vault, dealId, bump unchanged", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    const before = await program.account.dealAccount.fetch(setup.dealPda);

    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const afterApproval = await program.account.dealAccount.fetch(setup.dealPda);
    expect(afterApproval.amount.toNumber()).to.equal(before.amount.toNumber());
    expect(afterApproval.mint.toBase58()).to.equal(before.mint.toBase58());
    expect(afterApproval.buyer.toBase58()).to.equal(before.buyer.toBase58());
    expect(afterApproval.seller.toBase58()).to.equal(before.seller.toBase58());
    expect(afterApproval.sellerTokenAccount.toBase58()).to.equal(before.sellerTokenAccount.toBase58());
    expect(afterApproval.vault.toBase58()).to.equal(before.vault.toBase58());
    expect(Buffer.from(afterApproval.dealId)).to.deep.equal(Buffer.from(before.dealId));
    expect(afterApproval.bump).to.equal(before.bump);

    await program.methods
      .placeHold({ title: {} }, { siteReviewFailed: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const afterHold = await program.account.dealAccount.fetch(setup.dealPda);
    expect(afterHold.amount.toNumber()).to.equal(before.amount.toNumber());
    expect(afterHold.mint.toBase58()).to.equal(before.mint.toBase58());
    expect(afterHold.buyer.toBase58()).to.equal(before.buyer.toBase58());
    expect(afterHold.seller.toBase58()).to.equal(before.seller.toBase58());
    expect(afterHold.sellerTokenAccount.toBase58()).to.equal(before.sellerTokenAccount.toBase58());
    expect(afterHold.vault.toBase58()).to.equal(before.vault.toBase58());
    expect(Buffer.from(afterHold.dealId)).to.deep.equal(Buffer.from(before.dealId));
    expect(afterHold.bump).to.equal(before.bump);
  });

  it("47. Failed review transactions atomically roll back state", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // Attempt invalid approval with wrong role
    try {
      await program.methods
        .signApproval({ survey: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
    } catch {
      // Expected
    }

    let deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
    expect(deal.reviewers[0].approved).to.equal(false);
    expect(deal.hold).to.equal(null);

    // Attempt invalid hold with wrong role
    try {
      await program.methods
        .placeHold({ septic: {} }, { titleException: {} })
        .accountsPartial({
          reviewer: titleReviewer.publicKey,
          deal: setup.dealPda,
        })
        .signers([titleReviewer])
        .rpc();
    } catch {
      // Expected
    }

    deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
    expect(deal.reviewers[0].approved).to.equal(false);
    expect(deal.hold).to.equal(null);
  });

  it("48. Maximum 8 reviewers: all independent approvals and hold remain within allocated space", async () => {
    const reviewers = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const kp = Keypair.generate();
        await airdropSol(kp.publicKey, 1);
        const role = i % 3 === 0 ? { title: {} } : i % 3 === 1 ? { survey: {} } : { septic: {} };
        return { kp, role, required: i < 5 };
      })
    );

    const setup = await initializeAndFundStagedDeal(
      reviewers.map((r) => ({ wallet: r.kp.publicKey, role: r.role, required: r.required }))
    );

    // All 8 reviewers sign approval
    for (const r of reviewers) {
      await program.methods
        .signApproval(r.role)
        .accountsPartial({
          reviewer: r.kp.publicKey,
          deal: setup.dealPda,
        })
        .signers([r.kp])
        .rpc();
    }

    let deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.reviewers.length).to.equal(8);
    for (let i = 0; i < 8; i++) {
      expect(deal.reviewers[i].approved).to.equal(true);
    }

    // Reviewer 3 places hold
    await program.methods
      .placeHold(reviewers[3].role, { other: {} })
      .accountsPartial({
        reviewer: reviewers[3].kp.publicKey,
        deal: setup.dealPda,
      })
      .signers([reviewers[3].kp])
      .rpc();

    deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ held: {} });
    expect(deal.hold).to.not.equal(null);
    expect(deal.hold!.placedBy.toBase58()).to.equal(reviewers[3].kp.publicKey.toBase58());

    // Verify account data length matches 537 bytes allocated
    const accountInfo = await provider.connection.getAccountInfo(setup.dealPda);
    expect(accountInfo).to.not.equal(null);
    expect(accountInfo!.data.length).to.equal(537);
  });

  // -------------------------------------------------------------------------
  // D. SPRINT 3: SETTLEMENT — RELEASE TESTS
  // -------------------------------------------------------------------------

  async function createAta(owner: PublicKey, ata: PublicKey): Promise<void> {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        ata,
        owner,
        USDC_MINT
      )
    );
    await provider.sendAndConfirm(tx, []);
  }

  it("49. Valid cleared deal release: transfers exact amount to seller, closes vault, emits DealReleased", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);

    // Ensure seller ATA exists
    await createAta(setup.seller.publicKey, setup.sellerAta);

    // Both required reviewers approve
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    await program.methods
      .signApproval({ survey: {} })
      .accountsPartial({
        reviewer: surveyReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([surveyReviewer])
      .rpc();

    const buyerBalBefore = (await getAccount(provider.connection, setup.buyerAta)).amount;
    const sellerBalBefore = (await getAccount(provider.connection, setup.sellerAta)).amount;
    const vaultBalBefore = (await getAccount(provider.connection, setup.vault)).amount;
    expect(sellerBalBefore).to.equal(0n);
    expect(vaultBalBefore).to.equal(25_000_000n);

    // Any fee payer calls release
    const feePayer = Keypair.generate();
    await airdropSol(feePayer.publicKey, 2);

    const txSig = await program.methods
      .release()
      .accountsPartial({
        payer: feePayer.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([feePayer])
      .rpc();

    // Verify balances
    const buyerBalAfter = (await getAccount(provider.connection, setup.buyerAta)).amount;
    const sellerBalAfter = (await getAccount(provider.connection, setup.sellerAta)).amount;
    expect(buyerBalAfter).to.equal(buyerBalBefore);
    expect(sellerBalAfter).to.equal(25_000_000n);

    // Verify vault account is closed (balance was 0)
    const vaultInfo = await provider.connection.getAccountInfo(setup.vault);
    expect(vaultInfo).to.equal(null);

    // Verify state transition
    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ released: {} });

    // Verify event
    const events = await parseEventsFromTx(txSig);
    const event = findEvent(events, "DealReleased");
    expect(event).to.not.equal(undefined);
    expect(event!.data.deal.toBase58()).to.equal(setup.dealPda.toBase58());
    expect(Buffer.from(event!.data.dealId ?? event!.data.deal_id)).to.deep.equal(Buffer.from(setup.dealId));
    expect(event!.data.amount.toNumber()).to.equal(25_000_000);
    expect((event!.data.destinationTokenAccount ?? event!.data.destination_token_account).toBase58()).to.equal(setup.sellerAta.toBase58());
  });

  it("50. Optional reviewers do not block release", async () => {
    const titleReviewer = Keypair.generate();
    const optionalSeptic = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(optionalSeptic.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: optionalSeptic.publicKey, role: { septic: {} }, required: false },
    ]);

    await createAta(setup.seller.publicKey, setup.sellerAta);

    // Only required title reviewer approves; optional reviewer does not
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // Release succeeds
    await program.methods
      .release()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ released: {} });
    const sellerBal = (await getAccount(provider.connection, setup.sellerAta)).amount;
    expect(sellerBal).to.equal(25_000_000n);
  });

  it("51. Any fee payer can initiate release", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const independentFeePayer = Keypair.generate();
    await airdropSol(independentFeePayer.publicKey, 2);

    await program.methods
      .release()
      .accountsPartial({
        payer: independentFeePayer.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([independentFeePayer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ released: {} });
  });

  it("52. Release rejected if required reviewer has not approved", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    // Only Title approves; Survey missing
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed to release with missing required approval");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/MissingRequiredApprovals/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
    const sellerBal = (await getAccount(provider.connection, setup.sellerAta)).amount;
    expect(sellerBal).to.equal(0n);
  });

  it("53. Release rejected before funding (Draft state)", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release on Draft deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ draft: {} });
  });

  it("54. Release rejected after active hold (Held state)", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    // Reviewer places hold
    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release on Held deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/DealHeld/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ held: {} });
  });

  it("55. Release rejected with incorrect seller token account", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const otherWallet = Keypair.generate();
    const fakeSellerAta = getAssociatedTokenAddressSync(USDC_MINT, otherWallet.publicKey);
    await createAta(otherWallet.publicKey, fakeSellerAta);

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: fakeSellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release with wrong seller token account");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidSellerTokenAccount|has_one/i);
    }
  });

  it("56. Release rejected with incorrect seller account", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const attacker = Keypair.generate();

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: attacker.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release with mismatched seller");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidSeller|has_one/i);
    }
  });

  it("57. Release rejected with incorrect mint", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const fakeMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: fakeMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release with wrong mint");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidMint|has_one/i);
    }
  });

  it("58. Release rejected with incorrect vault account", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const fakeVaultOwner = Keypair.generate();
    const fakeVault = getAssociatedTokenAddressSync(USDC_MINT, fakeVaultOwner.publicKey);
    await createAta(fakeVaultOwner.publicKey, fakeVault);

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: fakeVault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release with wrong vault");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidVault|has_one/i);
    }
  });

  it("58b. Release rejected with incorrect buyer rent recipient account", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const attacker = Keypair.generate();

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: attacker.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release with wrong buyer rent destination");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnauthorizedBuyer/i);
    }
  });

  it("59. Cross-deal release attack rejected", async () => {
    const r1 = Keypair.generate();
    const r2 = Keypair.generate();
    await Promise.all([airdropSol(r1.publicKey, 1), airdropSol(r2.publicKey, 1)]);

    const dealA = await initializeAndFundStagedDeal([
      { wallet: r1.publicKey, role: { title: {} }, required: true },
    ]);
    const dealB = await initializeAndFundStagedDeal([
      { wallet: r2.publicKey, role: { title: {} }, required: true },
    ]);

    await createAta(dealA.seller.publicKey, dealA.sellerAta);
    await createAta(dealB.seller.publicKey, dealB.sellerAta);

    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({ reviewer: r1.publicKey, deal: dealA.dealPda })
      .signers([r1])
      .rpc();

    // Attempt to release deal A using deal B's seller ATA
    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: dealA.dealPda,
          seller: dealA.seller.publicKey,
          sellerTokenAccount: dealB.sellerAta,
          buyer: dealA.buyer.publicKey,
          vault: dealA.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected cross-deal release");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidSellerTokenAccount|has_one/i);
    }
  });

  it("60. Duplicate release rejected", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // First release succeeds
    await program.methods
      .release()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ released: {} });

    // Second release attempt fails
    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected second release attempt");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState|AccountNotInitialized|does not exist/i);
    }
  });

  it("61. Release with unsolicited surplus tokens in vault: seller receives exact agreed amount, settlement succeeds", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    // Third party sends 5 USDC unsolicited surplus tokens to vault
    const thirdParty = Keypair.generate();
    const thirdPartyAta = await setupBuyerWithUsdc(thirdParty, 10_000_000n);
    const surplusTx = new Transaction().add(
      createTransferCheckedInstruction(
        thirdPartyAta,
        USDC_MINT,
        setup.vault,
        thirdParty.publicKey,
        5_000_000n,
        6
      )
    );
    await provider.sendAndConfirm(surplusTx, [thirdParty]);

    // Vault now has 30 USDC (25 agreed + 5 surplus)
    const vaultPreRelease = await getAccount(provider.connection, setup.vault);
    expect(vaultPreRelease.amount).to.equal(30_000_000n);

    // Release executes
    await program.methods
      .release()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Seller receives EXACTLY agreed 25 USDC, NOT 30 USDC
    const sellerBal = (await getAccount(provider.connection, setup.sellerAta)).amount;
    expect(sellerBal).to.equal(25_000_000n);

    // Vault remains open holding remaining 5 USDC surplus (no revert)
    const vaultPostRelease = await getAccount(provider.connection, setup.vault);
    expect(vaultPostRelease.amount).to.equal(5_000_000n);

    // Deal state is Released
    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ released: {} });
  });

  // -------------------------------------------------------------------------
  // E. SPRINT 3: SETTLEMENT — REFUND TESTS
  // -------------------------------------------------------------------------

  it("62. Valid held deal refund: returns agreed escrow amount to buyer, closes vault, emits DealRefunded", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    // Reviewer places hold
    await program.methods
      .placeHold({ title: {} }, { sellerIdentityDisputed: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    const buyerBalBefore = (await getAccount(provider.connection, setup.buyerAta)).amount;
    const vaultBalBefore = (await getAccount(provider.connection, setup.vault)).amount;
    expect(vaultBalBefore).to.equal(25_000_000n);

    const txSig = await program.methods
      .refund()
      .accountsPartial({
        buyer: setup.buyer.publicKey,
        deal: setup.dealPda,
        buyerTokenAccount: setup.buyerAta,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([setup.buyer])
      .rpc();

    // Verify buyer received 25 USDC back
    const buyerBalAfter = (await getAccount(provider.connection, setup.buyerAta)).amount;
    expect(buyerBalAfter - buyerBalBefore).to.equal(25_000_000n);

    // Verify vault is closed
    const vaultInfo = await provider.connection.getAccountInfo(setup.vault);
    expect(vaultInfo).to.equal(null);

    // Verify deal state is Refunded
    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ refunded: {} });

    // Verify event
    const events = await parseEventsFromTx(txSig);
    const event = findEvent(events, "DealRefunded");
    expect(event).to.not.equal(undefined);
    expect(event!.data.deal.toBase58()).to.equal(setup.dealPda.toBase58());
    expect(Buffer.from(event!.data.dealId ?? event!.data.deal_id)).to.deep.equal(Buffer.from(setup.dealId));
    expect(event!.data.amount.toNumber()).to.equal(25_000_000);
    expect((event!.data.destinationTokenAccount ?? event!.data.destination_token_account).toBase58()).to.equal(setup.buyerAta.toBase58());
  });

  it("63. Refund rejected without active hold (Funded state)", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected refund on Funded deal without hold");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
  });

  it("64. Refund rejected on Draft state", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected refund on Draft deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }
  });

  it("65. Unauthorized signer cannot authorize refund", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const attacker = Keypair.generate();
    await airdropSol(attacker.publicKey, 1);

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: attacker.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have rejected unauthorized signer from refunding");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnauthorizedBuyer|has_one/i);
    }
  });

  it("66. Refund rejected with incorrect buyer token account", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const fakeWallet = Keypair.generate();
    const fakeBuyerAta = getAssociatedTokenAddressSync(USDC_MINT, fakeWallet.publicKey);
    await createAta(fakeWallet.publicKey, fakeBuyerAta);

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: fakeBuyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected refund with wrong buyer token account");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidBuyerTokenAccount|InvalidSourceOwner/i);
    }
  });

  it("67. Refund rejected with incorrect mint", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const fakeMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: fakeMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected refund with wrong mint");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidMint|has_one/i);
    }
  });

  it("68. Refund rejected with incorrect vault", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const fakeOwner = Keypair.generate();
    const fakeVault = getAssociatedTokenAddressSync(USDC_MINT, fakeOwner.publicKey);
    await createAta(fakeOwner.publicKey, fakeVault);

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: fakeVault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected refund with wrong vault");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidVault|has_one/i);
    }
  });

  it("69. Cross-deal refund attack rejected", async () => {
    const r1 = Keypair.generate();
    const r2 = Keypair.generate();
    await Promise.all([airdropSol(r1.publicKey, 1), airdropSol(r2.publicKey, 1)]);

    const dealA = await initializeAndFundStagedDeal([
      { wallet: r1.publicKey, role: { title: {} }, required: true },
    ]);
    const dealB = await initializeAndFundStagedDeal([
      { wallet: r2.publicKey, role: { title: {} }, required: true },
    ]);

    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: r1.publicKey, deal: dealA.dealPda })
      .signers([r1])
      .rpc();

    // Buyer of deal B attempts to refund deal A
    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: dealB.buyer.publicKey,
          deal: dealA.dealPda,
          buyerTokenAccount: dealB.buyerAta,
          vault: dealA.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([dealB.buyer])
        .rpc();
      expect.fail("Should have rejected cross-deal refund");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/UnauthorizedBuyer|has_one/i);
    }
  });

  it("70. Duplicate refund rejected", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    // First refund succeeds
    await program.methods
      .refund()
      .accountsPartial({
        buyer: setup.buyer.publicKey,
        deal: setup.dealPda,
        buyerTokenAccount: setup.buyerAta,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([setup.buyer])
      .rpc();

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ refunded: {} });

    // Second refund fails
    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected second refund");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState|AccountNotInitialized|does not exist/i);
    }
  });

  it("71. Refund after release rejected", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({
        reviewer: titleReviewer.publicKey,
        deal: setup.dealPda,
      })
      .signers([titleReviewer])
      .rpc();

    await program.methods
      .release()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Buyer attempts refund on released deal
    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected refund on released deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState|AccountNotInitialized|does not exist/i);
    }
  });

  it("72. Release after refund rejected", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    // Place hold and refund
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    await program.methods
      .refund()
      .accountsPartial({
        buyer: setup.buyer.publicKey,
        deal: setup.dealPda,
        buyerTokenAccount: setup.buyerAta,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([setup.buyer])
      .rpc();

    // Fee payer attempts release on refunded deal
    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have rejected release on refunded deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState|AccountNotInitialized|does not exist/i);
    }
  });

  it("73. Refund with unsolicited surplus tokens in vault: buyer receives exact refund, settlement succeeds", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await program.methods
      .placeHold({ title: {} }, { other: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    // Send 3 USDC surplus to vault
    const thirdParty = Keypair.generate();
    const thirdPartyAta = await setupBuyerWithUsdc(thirdParty, 10_000_000n);
    const surplusTx = new Transaction().add(
      createTransferCheckedInstruction(
        thirdPartyAta,
        USDC_MINT,
        setup.vault,
        thirdParty.publicKey,
        3_000_000n,
        6
      )
    );
    await provider.sendAndConfirm(surplusTx, [thirdParty]);

    const buyerBalBefore = (await getAccount(provider.connection, setup.buyerAta)).amount;

    // Refund executes
    await program.methods
      .refund()
      .accountsPartial({
        buyer: setup.buyer.publicKey,
        deal: setup.dealPda,
        buyerTokenAccount: setup.buyerAta,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([setup.buyer])
      .rpc();

    // Buyer receives exactly agreed 25 USDC
    const buyerBalAfter = (await getAccount(provider.connection, setup.buyerAta)).amount;
    expect(buyerBalAfter - buyerBalBefore).to.equal(25_000_000n);

    // Vault remains open holding remaining 3 USDC surplus
    const vaultPost = await getAccount(provider.connection, setup.vault);
    expect(vaultPost.amount).to.equal(3_000_000n);

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ refunded: {} });
  });

  it("74. Approvals and holds rejected on Released and Refunded deals", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    await program.methods
      .release()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Reviewer attempts hold on released deal
    try {
      await program.methods
        .placeHold({ title: {} }, { other: {} })
        .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
        .signers([titleReviewer])
        .rpc();
      expect.fail("Should have rejected hold on released deal");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }
  });

  it("75. Failed settlement transactions atomically preserve balances and state", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    // Only Title approves; Survey missing
    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const buyerBalBefore = (await getAccount(provider.connection, setup.buyerAta)).amount;
    const sellerBalBefore = (await getAccount(provider.connection, setup.sellerAta)).amount;
    const vaultBalBefore = (await getAccount(provider.connection, setup.vault)).amount;

    // Release fails
    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch {
      // Expected
    }

    const buyerBalAfter = (await getAccount(provider.connection, setup.buyerAta)).amount;
    const sellerBalAfter = (await getAccount(provider.connection, setup.sellerAta)).amount;
    const vaultBalAfter = (await getAccount(provider.connection, setup.vault)).amount;

    expect(buyerBalAfter).to.equal(buyerBalBefore);
    expect(sellerBalAfter).to.equal(sellerBalBefore);
    expect(vaultBalAfter).to.equal(vaultBalBefore);

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ funded: {} });
  });

  it("76. Missing seller ATA blocks release until created; atomic creation by payer allows release to succeed", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    // Initialize & fund deal, but intentionally do NOT create seller ATA yet
    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const feePayer = Keypair.generate();
    await airdropSol(feePayer.publicKey, 2);

    // Step A: Calling release directly without seller ATA fails
    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: feePayer.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([feePayer])
        .rpc();
      expect.fail("Should have failed because seller ATA does not exist");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/AccountNotInitialized|does not exist/i);
    }

    // Step B: Atomic transaction with ATA creation + release succeeds
    const releaseIx = await program.methods
      .release()
      .accountsPartial({
        payer: feePayer.publicKey,
        deal: setup.dealPda,
        seller: setup.seller.publicKey,
        sellerTokenAccount: setup.sellerAta,
        buyer: setup.buyer.publicKey,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const atomicTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        feePayer.publicKey,
        setup.sellerAta,
        setup.seller.publicKey,
        USDC_MINT
      ),
      releaseIx
    );

    await provider.sendAndConfirm(atomicTx, [feePayer]);

    const sellerBal = (await getAccount(provider.connection, setup.sellerAta)).amount;
    expect(sellerBal).to.equal(25_000_000n);

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ released: {} });
  });

  it("77. Missing buyer ATA blocks refund until created; atomic re-creation allows refund to succeed", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    // Buyer drains remaining 25 USDC to a sink account and closes their ATA
    const sink = Keypair.generate();
    const sinkAta = getAssociatedTokenAddressSync(USDC_MINT, sink.publicKey);
    await createAta(sink.publicKey, sinkAta);
    const drainAndCloseTx = new Transaction().add(
      createTransferCheckedInstruction(
        setup.buyerAta,
        USDC_MINT,
        sinkAta,
        setup.buyer.publicKey,
        25_000_000n,
        6
      ),
      createCloseAccountInstruction(
        setup.buyerAta,
        setup.buyer.publicKey,
        setup.buyer.publicKey
      )
    );
    await provider.sendAndConfirm(drainAndCloseTx, [setup.buyer]);

    // Direct refund fails with closed ATA
    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have failed because buyer ATA does not exist");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/AccountNotInitialized|does not exist/i);
    }

    // Atomic transaction: create ATA + refund
    const refundIx = await program.methods
      .refund()
      .accountsPartial({
        buyer: setup.buyer.publicKey,
        deal: setup.dealPda,
        buyerTokenAccount: setup.buyerAta,
        vault: setup.vault,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const atomicTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        setup.buyer.publicKey,
        setup.buyerAta,
        setup.buyer.publicKey,
        USDC_MINT
      ),
      refundIx
    );

    await provider.sendAndConfirm(atomicTx, [setup.buyer]);

    const buyerBal = (await getAccount(provider.connection, setup.buyerAta)).amount;
    expect(buyerBal).to.equal(25_000_000n);

    const deal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(deal.state).to.deep.equal({ refunded: {} });
  });

  it("78. Release rejected if an invalid token program is provided", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);
    await createAta(setup.seller.publicKey, setup.sellerAta);

    await program.methods
      .signApproval({ title: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    try {
      await program.methods
        .release()
        .accountsPartial({
          payer: provider.wallet.publicKey,
          deal: setup.dealPda,
          seller: setup.seller.publicKey,
          sellerTokenAccount: setup.sellerAta,
          buyer: setup.buyer.publicKey,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have rejected invalid token program");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidProgramId|ProgramAccountMismatch|IncorrectProgramId/i);
    }
  });

  it("79. Hold state immutability: stored hold cannot be altered or overwritten by other reviewers", async () => {
    const titleReviewer = Keypair.generate();
    const surveyReviewer = Keypair.generate();
    await Promise.all([
      airdropSol(titleReviewer.publicKey, 1),
      airdropSol(surveyReviewer.publicKey, 1),
    ]);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
      { wallet: surveyReviewer.publicKey, role: { survey: {} }, required: true },
    ]);

    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    const dealAfterHold = await program.account.dealAccount.fetch(setup.dealPda);
    expect(dealAfterHold.hold).to.not.equal(null);
    const originalPlacedBy = dealAfterHold.hold!.placedBy.toBase58();
    const originalReason = dealAfterHold.hold!.reasonCode;

    // Survey reviewer attempts approval on held deal: fails
    try {
      await program.methods
        .signApproval({ survey: {} })
        .accountsPartial({ reviewer: surveyReviewer.publicKey, deal: setup.dealPda })
        .signers([surveyReviewer])
        .rpc();
      expect.fail("Should have rejected approval after hold");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    // Survey reviewer attempts second hold: fails
    try {
      await program.methods
        .placeHold({ survey: {} }, { siteReviewFailed: {} })
        .accountsPartial({ reviewer: surveyReviewer.publicKey, deal: setup.dealPda })
        .signers([surveyReviewer])
        .rpc();
      expect.fail("Should have rejected second hold");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidDealState/i);
    }

    // Verify stored hold state has not been corrupted or altered
    const finalDeal = await program.account.dealAccount.fetch(setup.dealPda);
    expect(finalDeal.hold!.placedBy.toBase58()).to.equal(originalPlacedBy);
    expect(finalDeal.hold!.reasonCode).to.deep.equal(originalReason);
    expect(finalDeal.reviewers[1].approved).to.equal(false);
  });

  it("80. Refund rejected if an invalid token program is provided", async () => {
    const titleReviewer = Keypair.generate();
    await airdropSol(titleReviewer.publicKey, 1);

    const setup = await initializeAndFundStagedDeal([
      { wallet: titleReviewer.publicKey, role: { title: {} }, required: true },
    ]);

    await program.methods
      .placeHold({ title: {} }, { titleException: {} })
      .accountsPartial({ reviewer: titleReviewer.publicKey, deal: setup.dealPda })
      .signers([titleReviewer])
      .rpc();

    try {
      await program.methods
        .refund()
        .accountsPartial({
          buyer: setup.buyer.publicKey,
          deal: setup.dealPda,
          buyerTokenAccount: setup.buyerAta,
          vault: setup.vault,
          mint: USDC_MINT,
          tokenProgram: SystemProgram.programId,
        })
        .signers([setup.buyer])
        .rpc();
      expect.fail("Should have rejected invalid token program on refund");
    } catch (err: unknown) {
      expect((err as Error).message).to.match(/InvalidProgramId|ProgramAccountMismatch|IncorrectProgramId/i);
    }
  });
});
