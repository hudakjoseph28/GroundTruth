import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
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
});
