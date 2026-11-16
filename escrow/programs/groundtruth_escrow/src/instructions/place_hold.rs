use anchor_lang::prelude::*;

use crate::{
    constants::DEAL_SEED,
    error::EscrowError,
    state::{DealAccount, DealState, HoldPlaced, HoldReason, HoldState, ReviewerRole},
};

#[derive(Accounts)]
pub struct PlaceHold<'info> {
    pub reviewer: Signer<'info>,

    #[account(
        mut,
        seeds = [DEAL_SEED, deal.buyer.as_ref(), deal.deal_id.as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, DealAccount>,
}

pub fn handle_place_hold(
    ctx: Context<PlaceHold>,
    role: ReviewerRole,
    reason_code: HoldReason,
) -> Result<()> {
    require!(
        ctx.accounts.deal.state == DealState::Funded,
        EscrowError::InvalidDealState
    );

    let reviewer_key = ctx.accounts.reviewer.key();
    let assignment = ctx
        .accounts
        .deal
        .reviewers
        .iter()
        .find(|r| r.wallet == reviewer_key)
        .ok_or(EscrowError::UnassignedReviewer)?;

    require!(assignment.role == role, EscrowError::InvalidReviewerRole);

    let clock = Clock::get()?;
    let hold_state = HoldState {
        placed_by: reviewer_key,
        role,
        reason_code,
        placed_at: clock.unix_timestamp,
    };

    let deal = &mut ctx.accounts.deal;
    deal.hold = Some(hold_state);
    deal.state = DealState::Held;

    emit!(HoldPlaced {
        deal: deal.key(),
        deal_id: deal.deal_id,
        reviewer: reviewer_key,
        role,
        reason_code,
    });

    Ok(())
}
