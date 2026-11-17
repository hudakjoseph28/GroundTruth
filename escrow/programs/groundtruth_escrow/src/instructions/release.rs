use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{DEAL_SEED, USDC_DECIMALS},
    error::EscrowError,
    state::{DealAccount, DealReleased, DealState},
};

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [DEAL_SEED, deal.buyer.as_ref(), deal.deal_id.as_ref()],
        bump = deal.bump,
        has_one = seller @ EscrowError::InvalidSeller,
        has_one = seller_token_account @ EscrowError::InvalidSellerTokenAccount,
        has_one = mint @ EscrowError::InvalidMint,
        has_one = vault @ EscrowError::InvalidVault,
    )]
    pub deal: Account<'info, DealAccount>,

    /// CHECK: Validated via has_one = seller on deal.
    #[account(
        mut,
        address = deal.seller @ EscrowError::InvalidSeller
    )]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = seller_token_account.key() == deal.seller_token_account @ EscrowError::InvalidSellerTokenAccount,
        constraint = seller_token_account.owner == seller.key() @ EscrowError::InvalidSellerTokenAccount,
        constraint = seller_token_account.mint == deal.mint @ EscrowError::InvalidMint,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    /// CHECK: Destination for vault rent lamports if closed. Validated to match deal.buyer.
    #[account(
        mut,
        address = deal.buyer @ EscrowError::UnauthorizedBuyer
    )]
    pub buyer: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault.key() == deal.vault @ EscrowError::InvalidVault,
        constraint = vault.owner == deal.key() @ EscrowError::InvalidVaultAuthority,
        constraint = vault.mint == deal.mint @ EscrowError::InvalidMint,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        address = deal.mint @ EscrowError::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_release(ctx: Context<Release>) -> Result<()> {
    require!(
        ctx.accounts.deal.state == DealState::Funded,
        EscrowError::InvalidDealState
    );
    require!(ctx.accounts.deal.hold.is_none(), EscrowError::DealHeld);

    let has_required = ctx.accounts.deal.reviewers.iter().any(|r| r.required);
    let all_required_approved = has_required
        && ctx
            .accounts
            .deal
            .reviewers
            .iter()
            .filter(|r| r.required)
            .all(|r| r.approved);
    require!(all_required_approved, EscrowError::MissingRequiredApprovals);

    let amount = ctx.accounts.deal.amount;
    require!(
        ctx.accounts.vault.amount >= amount,
        EscrowError::InsufficientVaultBalance
    );

    let buyer_key = ctx.accounts.deal.buyer;
    let deal_id = ctx.accounts.deal.deal_id;
    let bump = ctx.accounts.deal.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[DEAL_SEED, buyer_key.as_ref(), deal_id.as_ref(), &[bump]]];

    let cpi_accounts = anchor_spl::token::TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.seller_token_account.to_account_info(),
        authority: ctx.accounts.deal.to_account_info(),
    };
    let cpi_ctx =
        CpiContext::new_with_signer(ctx.accounts.token_program.key(), cpi_accounts, signer_seeds);
    anchor_spl::token::transfer_checked(cpi_ctx, amount, USDC_DECIMALS)?;

    ctx.accounts.vault.reload()?;
    if ctx.accounts.vault.amount == 0 {
        let close_accounts = anchor_spl::token::CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.buyer.to_account_info(),
            authority: ctx.accounts.deal.to_account_info(),
        };
        let close_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            close_accounts,
            signer_seeds,
        );
        anchor_spl::token::close_account(close_cpi_ctx)?;
    }

    let deal = &mut ctx.accounts.deal;
    deal.state = DealState::Released;

    emit!(DealReleased {
        deal: deal.key(),
        deal_id,
        amount,
        destination_token_account: ctx.accounts.seller_token_account.key(),
    });

    Ok(())
}
