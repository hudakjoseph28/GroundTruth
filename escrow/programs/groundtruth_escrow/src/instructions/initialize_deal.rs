use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::{DEAL_SEED, MAX_REVIEWERS, USDC_MINT_DEVNET},
    error::EscrowError,
    state::{DealAccount, DealInitialized, DealState, ReviewerAssignment, ReviewerInput},
};

#[derive(Accounts)]
#[instruction(deal_id: [u8; 32])]
pub struct InitializeDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        init,
        payer = buyer,
        space = 8 + DealAccount::INIT_SPACE,
        seeds = [DEAL_SEED, buyer.key().as_ref(), deal_id.as_ref()],
        bump,
    )]
    pub deal: Account<'info, DealAccount>,

    /// CHECK: Validated against non-default, non-buyer, and ATA derivation.
    pub seller: UncheckedAccount<'info>,

    /// CHECK: Validated to match get_associated_token_address(seller.key, mint.key).
    pub seller_token_account: UncheckedAccount<'info>,

    #[account(
        // Enforce the agreed USDC mint
        address = USDC_MINT_DEVNET @ EscrowError::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = deal,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_initialize_deal(
    ctx: Context<InitializeDeal>,
    deal_id: [u8; 32],
    amount: u64,
    reviewers: Vec<ReviewerInput>,
) -> Result<()> {
    require!(amount > 0, EscrowError::ZeroAmount);
    require_keys_neq!(
        ctx.accounts.seller.key(),
        Pubkey::default(),
        EscrowError::InvalidSeller
    );
    require_keys_neq!(
        ctx.accounts.seller.key(),
        ctx.accounts.buyer.key(),
        EscrowError::BuyerSellerSame
    );

    let expected_seller_ata = anchor_spl::associated_token::get_associated_token_address(
        &ctx.accounts.seller.key(),
        &ctx.accounts.mint.key(),
    );
    require_keys_eq!(
        ctx.accounts.seller_token_account.key(),
        expected_seller_ata,
        EscrowError::InvalidSellerTokenAccount
    );

    require!(
        reviewers.iter().any(|r| r.required),
        EscrowError::NoRequiredReviewers
    );

    require!(
        reviewers.len() <= MAX_REVIEWERS,
        EscrowError::TooManyReviewers
    );

    for (i, r) in reviewers.iter().enumerate() {
        require_keys_neq!(
            r.wallet,
            Pubkey::default(),
            EscrowError::InvalidReviewerAssignment
        );
        require_keys_neq!(
            r.wallet,
            ctx.accounts.buyer.key(),
            EscrowError::InvalidReviewerAssignment
        );
        require_keys_neq!(
            r.wallet,
            ctx.accounts.seller.key(),
            EscrowError::InvalidReviewerAssignment
        );

        for (j, other) in reviewers.iter().enumerate() {
            if i != j {
                require_keys_neq!(r.wallet, other.wallet, EscrowError::DuplicateReviewer);
            }
        }
    }

    let deal = &mut ctx.accounts.deal;
    deal.deal_id = deal_id;
    deal.buyer = ctx.accounts.buyer.key();
    deal.seller = ctx.accounts.seller.key();
    deal.seller_token_account = ctx.accounts.seller_token_account.key();
    deal.mint = ctx.accounts.mint.key();
    deal.vault = ctx.accounts.vault.key();
    deal.amount = amount;
    deal.state = DealState::Draft;
    deal.reviewers = reviewers
        .into_iter()
        .map(|r| ReviewerAssignment {
            wallet: r.wallet,
            role: r.role,
            required: r.required,
            approved: false,
        })
        .collect();
    deal.hold = None;
    deal.bump = ctx.bumps.deal;

    emit!(DealInitialized {
        deal: deal.key(),
        deal_id,
        buyer: deal.buyer,
        seller: deal.seller,
        mint: deal.mint,
        amount: deal.amount,
    });

    Ok(())
}
