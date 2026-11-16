use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Escrow amount must be greater than zero")]
    ZeroAmount,
    #[msg("Invalid token mint: must be Circle Devnet USDC")]
    InvalidMint,
    #[msg("Invalid seller address")]
    InvalidSeller,
    #[msg("Buyer and seller cannot be the same address")]
    BuyerSellerSame,
    #[msg("Invalid seller associated token account for bound seller and mint")]
    InvalidSellerTokenAccount,
    #[msg("Maximum 8 reviewers allowed")]
    TooManyReviewers,
    #[msg("Duplicate reviewer wallet")]
    DuplicateReviewer,
    #[msg("Invalid reviewer assignment: wallet cannot be default, buyer, or seller")]
    InvalidReviewerAssignment,
    #[msg("Only the bound buyer can perform this action")]
    UnauthorizedBuyer,
    #[msg("Deal is not in the required state")]
    InvalidDealState,
    #[msg("Invalid vault token account")]
    InvalidVault,
    #[msg("Invalid vault authority: must be the Deal PDA")]
    InvalidVaultAuthority,
    #[msg("Source token account must be owned by the buyer")]
    InvalidSourceOwner,
    #[msg("Vault token balance does not match the expected escrow amount")]
    VaultAmountMismatch,
    #[msg("Reviewer is not assigned to this deal")]
    UnassignedReviewer,
    #[msg("Reviewer role does not match assigned role")]
    InvalidReviewerRole,
    #[msg("Reviewer has already approved this deal")]
    DuplicateApproval,
    #[msg("Deal must have at least one required reviewer")]
    NoRequiredReviewers,
}
