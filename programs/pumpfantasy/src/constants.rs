use anchor_lang::prelude::*;

pub const PICKS_PER_ENTRY: usize = 5;

/// Total fantasy-point budget a player can spend across their 5 picks.
/// Matches the "4,000 FP available" budget shown in the reference UI.
#[constant]
pub const MAX_BUDGET_FP: u32 = 4_000;

/// Platform rake taken out of the prize pool before it's split among winners.
#[constant]
pub const RAKE_BPS: u16 = 500; // 5%

/// A single pick can never drag the entry's score below -100%, even if the
/// coin goes to zero — nobody is wiped out worse than fully on one slot.
#[constant]
pub const SCORE_FLOOR_BPS: i64 = -10_000;

/// Fixed-point scale used for on-chain prices (price * 1e6).
#[constant]
pub const PRICE_SCALE: u64 = 1_000_000;

pub const BPS_DENOMINATOR: i64 = 10_000;

pub const TOURNAMENT_SEED: &[u8] = b"tournament";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ASSET_SEED: &[u8] = b"asset";
pub const ENTRY_SEED: &[u8] = b"entry";
