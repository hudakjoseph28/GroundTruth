/**
 * When a database test's own copy of the staged deal is registered. The
 * staged fixture's row carries the real afternoon the deal was registered
 * (2026-11-18); these tests write chain events dated 2026-11-15, so their
 * copy is registered before that to keep the off-chain row first.
 */
export const TEST_DEAL_CREATED_AT = "2026-11-12T00:00:00.000Z";
