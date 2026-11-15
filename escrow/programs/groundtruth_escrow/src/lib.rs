pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2ox43XbbztcxCt7LDZaF9fSaRezwTbCNxWBKf89uVHP1");

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
}
