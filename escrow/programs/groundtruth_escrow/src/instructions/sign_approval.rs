use anchor_lang::prelude::*;

use crate::{
    constants::DEAL_SEED,
    error::EscrowError,
    state::{ApprovalSigned, DealAccount, DealState, ReviewerRole},
};

#[derive(Accounts)]
pub struct SignApproval<'info> {
    pub reviewer: Signer<'info>,

    #[account(
        mut,
        seeds = [DEAL_SEED, deal.buyer.as_ref(), deal.deal_id.as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, DealAccount>,
}

pub fn handle_sign_approval(ctx: Context<SignApproval>, role: ReviewerRole) -> Result<()> {
    require!(
        ctx.accounts.deal.state == DealState::Funded,
        EscrowError::InvalidDealState
    );

    let reviewer_key = ctx.accounts.reviewer.key();
    let assignment = ctx
        .accounts
        .deal
        .reviewers
        .iter_mut()
        .find(|r| r.wallet == reviewer_key)
        .ok_or(EscrowError::UnassignedReviewer)?;

    require!(assignment.role == role, EscrowError::InvalidReviewerRole);
    require!(!assignment.approved, EscrowError::DuplicateApproval);

    assignment.approved = true;

    emit!(ApprovalSigned {
        deal: ctx.accounts.deal.key(),
        deal_id: ctx.accounts.deal.deal_id,
        reviewer: reviewer_key,
        role,
    });

    Ok(())
}
