use anchor_lang::prelude::*;

#[constant]
pub const DEAL_SEED: &[u8] = b"deal";

#[constant]
pub const USDC_MINT_DEVNET: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

#[constant]
pub const USDC_DECIMALS: u8 = 6;

pub const MAX_REVIEWERS: usize = 8;
