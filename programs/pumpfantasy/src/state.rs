use anchor_lang::prelude::*;

use crate::constants::PICKS_PER_ENTRY;

#[account]
#[derive(InitSpace)]
pub struct Tournament {
    /// Backend/admin key allowed to add assets and submit price results.
    /// This is the trust boundary: there is no free, reliable on-chain
    /// price feed for freshly-launched Solana coins, so final prices are
    /// attested by our own backend the same way SwapKings attests
    /// pump.fun founder wallets — the score math itself still happens
    /// on-chain and can't be faked once a price is submitted.
    pub authority: Pubkey,
    pub id: u64,
    pub entry_fee_lamports: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub asset_count: u16,
    pub entry_count: u32,
    pub settled_count: u32,
    pub prize_pool_lamports: u64,
    pub status: TournamentStatus,
    /// Set by `finalize_tournament`.
    pub winners_count: u32,
    pub threshold_score_bps: i32,
    pub distributed_pool_lamports: u64,
    /// Single: one entry per wallet, enforced on-chain (see
    /// `enter_tournament`'s explicit check — PDA uniqueness alone only
    /// blocks a *second* entry at the same index, not a first entry at a
    /// non-zero index). Multiple: a wallet may hold any number of entries,
    /// each its own portfolio, competing independently (including against
    /// its own other entries).
    pub entry_mode: EntryMode,
    /// 0 = not a guaranteed-prize tournament. Nonzero = the house has
    /// committed to a payout pool of at least this many lamports regardless
    /// of how many entries actually land — just the flag/amount for now,
    /// display-only (the "G" badge); the actual house top-up instruction
    /// (fund the vault up to this floor before finalize) isn't built yet.
    pub guaranteed_amount_lamports: u64,
    pub vault_bump: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TournamentStatus {
    Open,
    Finalized,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EntryMode {
    Single,
    Multiple,
}

#[account]
#[derive(InitSpace)]
pub struct TournamentAsset {
    pub tournament: Pubkey,
    pub mint: Pubkey,
    /// Fantasy-point cost, derived off-chain from the coin's age (younger =
    /// pricier, since it can swing much harder — see design notes).
    pub fp_cost: u32,
    pub start_price_micros: u64,
    pub end_price_micros: u64,
    pub resolved: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Entry {
    pub tournament: Pubkey,
    pub player: Pubkey,
    /// Which of this player's entries in this tournament this is — 0 for
    /// every Single-mode entry (there's only ever one), 0..N for Multiple
    /// mode. Part of this account's own PDA seeds, also stored here so
    /// clients can display/sort a player's entries without re-deriving it.
    pub entry_index: u16,
    pub picks: [Pubkey; PICKS_PER_ENTRY],
    pub fp_spent: u32,
    pub score_bps: i32,
    pub settled: bool,
    pub claimed: bool,
    pub bump: u8,
}
