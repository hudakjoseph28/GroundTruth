use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{DEAL_SEED, USDC_DECIMALS},
    error::EscrowError,
    state::{DealAccount, DealFunded, DealState},
};

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [DEAL_SEED, deal.buyer.as_ref(), deal.deal_id.as_ref()],
        bump = deal.bump,
        has_one = buyer @ EscrowError::UnauthorizedBuyer,
        has_one = mint @ EscrowError::InvalidMint,
        has_one = vault @ EscrowError::InvalidVault,
    )]
    pub deal: Account<'info, DealAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key() @ EscrowError::InvalidSourceOwner,
        constraint = buyer_token_account.mint == deal.mint @ EscrowError::InvalidMint,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
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

pub fn handle_fund(ctx: Context<Fund>) -> Result<()> {
    require!(
        ctx.accounts.deal.state == DealState::Draft,
        EscrowError::InvalidDealState
    );

    let amount = ctx.accounts.deal.amount;

    let vault_balance_before = ctx.accounts.vault.amount;

    let cpi_accounts = anchor_spl::token::TransferChecked {
        from: ctx.accounts.buyer_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    anchor_spl::token::transfer_checked(cpi_ctx, amount, USDC_DECIMALS)?;

    ctx.accounts.vault.reload()?;
    let vault_balance_after = ctx.accounts.vault.amount;

    let balance_increase = vault_balance_after
        .checked_sub(vault_balance_before)
        .ok_or(EscrowError::VaultAmountMismatch)?;

    require_eq!(
        balance_increase,
        amount,
        EscrowError::VaultAmountMismatch
    );

    let deal = &mut ctx.accounts.deal;
    deal.state = DealState::Funded;

    emit!(DealFunded {
        deal: deal.key(),
        deal_id: deal.deal_id,
        buyer: deal.buyer,
        amount: deal.amount,
    });

    Ok(())
}
