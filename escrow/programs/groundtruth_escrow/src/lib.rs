pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG");

#[program]
pub mod groundtruth_escrow {
    use super::*;

    pub fn initialize_deal(
        ctx: Context<InitializeDeal>,
        deal_id: [u8; 32],
        amount: u64,
        reviewers: Vec<ReviewerInput>,
    ) -> Result<()> {
        instructions::initialize_deal::handle_initialize_deal(ctx, deal_id, amount, reviewers)
    }

    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        instructions::fund::handle_fund(ctx)
    }

    pub fn sign_approval(ctx: Context<SignApproval>, role: ReviewerRole) -> Result<()> {
        instructions::sign_approval::handle_sign_approval(ctx, role)
    }

    pub fn place_hold(
        ctx: Context<PlaceHold>,
        role: ReviewerRole,
        reason_code: HoldReason,
    ) -> Result<()> {
        instructions::place_hold::handle_place_hold(ctx, role, reason_code)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        instructions::release::handle_release(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund(ctx)
    }
}
