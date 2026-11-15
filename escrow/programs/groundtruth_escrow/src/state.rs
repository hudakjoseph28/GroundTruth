use anchor_lang::prelude::*;
use crate::constants::MAX_REVIEWERS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug, Default)]
pub enum DealState {
    #[default]
    Draft,
    Funded,
    Held,
    Released,
    Refunded,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ReviewerRole {
    Title,
    Survey,
    Septic,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct ReviewerAssignment {
    pub wallet: Pubkey,
    pub role: ReviewerRole,
    pub required: bool,
    pub approved: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum HoldReason {
    SellerIdentityDisputed,
    TitleException,
    SiteReviewFailed,
    Other,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct HoldState {
    pub placed_by: Pubkey,
    pub role: ReviewerRole,
    pub reason_code: HoldReason,
    pub placed_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ReviewerInput {
    pub wallet: Pubkey,
    pub role: ReviewerRole,
    pub required: bool,
}

#[account]
#[derive(InitSpace)]
pub struct DealAccount {
    pub deal_id: [u8; 32],
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub seller_token_account: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub state: DealState,
    #[max_len(MAX_REVIEWERS)]
    pub reviewers: Vec<ReviewerAssignment>,
    pub hold: Option<HoldState>,
    pub bump: u8,
}

#[event]
pub struct DealInitialized {
    pub deal: Pubkey,
    pub deal_id: [u8; 32],
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DealFunded {
    pub deal: Pubkey,
    pub deal_id: [u8; 32],
    pub buyer: Pubkey,
    pub amount: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deal_account_space_and_serialization() {
        let max_reviewers = (0..MAX_REVIEWERS)
            .map(|_| ReviewerAssignment {
                wallet: Pubkey::new_unique(),
                role: ReviewerRole::Title,
                required: true,
                approved: false,
            })
            .collect();

        let deal = DealAccount {
            deal_id: [1u8; 32],
            buyer: Pubkey::new_unique(),
            seller: Pubkey::new_unique(),
            seller_token_account: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            amount: 25_000_000,
            state: DealState::Draft,
            reviewers: max_reviewers,
            hold: Some(HoldState {
                placed_by: Pubkey::new_unique(),
                role: ReviewerRole::Title,
                reason_code: HoldReason::SellerIdentityDisputed,
                placed_at: 1700000000,
            }),
            bump: 255,
        };

        let mut serialized = Vec::new();
        deal.try_serialize(&mut serialized).unwrap();

        // Account::try_serialize includes the 8-byte Anchor discriminator.
        let serialized_len = serialized.len();
        let allocated_space = 8 + DealAccount::INIT_SPACE;
        assert_eq!(
            allocated_space, 537,
            "Expected allocated space to be exactly 537 bytes (8 + 529)"
        );
        assert!(
            serialized_len <= allocated_space,
            "Serialized size {} exceeds allocated space {}",
            serialized_len,
            allocated_space
        );

        let deserialized = DealAccount::try_deserialize(&mut &serialized[..]).unwrap();
        assert_eq!(deserialized.deal_id, deal.deal_id);
        assert_eq!(deserialized.amount, 25_000_000);
        assert_eq!(deserialized.reviewers.len(), MAX_REVIEWERS);
        assert!(deserialized.hold.is_some());
    }

    #[test]
    fn test_deal_account_empty_reviewers_and_none_hold() {
        let deal = DealAccount {
            deal_id: [2u8; 32],
            buyer: Pubkey::new_unique(),
            seller: Pubkey::new_unique(),
            seller_token_account: Pubkey::new_unique(),
            mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            amount: 10_000_000,
            state: DealState::Draft,
            reviewers: Vec::new(),
            hold: None,
            bump: 254,
        };

        let mut serialized = Vec::new();
        deal.try_serialize(&mut serialized).unwrap();

        let allocated_space = 8 + DealAccount::INIT_SPACE;
        assert!(
            serialized.len() <= allocated_space,
            "Serialized size {} exceeds allocated space {}",
            serialized.len(),
            allocated_space
        );

        let deserialized = DealAccount::try_deserialize(&mut &serialized[..]).unwrap();
        assert_eq!(deserialized.deal_id, deal.deal_id);
        assert_eq!(deserialized.reviewers.len(), 0);
        assert!(deserialized.hold.is_none());
    }
}

