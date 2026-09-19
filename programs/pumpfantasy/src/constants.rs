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

/// How long after end_ts a tournament with unsettleable entries must wait
/// before the authority may cancel it (and entries get refunded) — long
/// enough that a slow price backfill has had every chance to fix it first.
pub const CANCEL_GRACE_SECONDS: i64 = 3_600;

pub const TOURNAMENT_SEED: &[u8] = b"tournament";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ASSET_SEED: &[u8] = b"asset";
pub const ENTRY_SEED: &[u8] = b"entry";

/// Dedicated backend keypair (Cloudflare Worker secret, never in the repo)
/// whose Ed25519 signature `enter_tournament` requires on a short-lived
/// attestation of each pick's fp_cost — there is no free, reliable way for
/// the program itself to independently know a coin's age/tier at entry
/// time, so a trusted off-chain signer attests it instead (same pattern as
/// SwapKings' `join_guild` founder-wallet attestation). The math itself
/// (budget sum ≤ MAX_BUDGET_FP) still happens on-chain and can't be faked
/// once the attestation is in the transaction — this only replaces "where
/// did fp_cost come from", not "is the budget actually enforced".
pub const ATTESTATION_SIGNER: Pubkey = pubkey!("BFKxn8Et3r2fjHDt5DhMHZBzpKeXT6gKNATnF87MkSC4");
