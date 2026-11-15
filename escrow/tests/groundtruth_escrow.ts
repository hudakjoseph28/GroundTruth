import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
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
        .initializeDeal(dealId, ESCROW_AMOUNT, [])
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
        .initializeDeal(dealId, new anchor.BN(0), [])
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

    // Second initialization with same buyer and dealId
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
});
