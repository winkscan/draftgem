use anchor_lang::prelude::*;

use crate::constants::PICKS_PER_ENTRY;

#[account]
#[derive(InitSpace)]
pub struct Tournament {
    /// Backend/admin key allowed to register post-start asset prices and
    /// finalize the tournament. This is the trust boundary: there is no
    /// free, reliable on-chain price feed for freshly-launched Solana
    /// coins, so prices are attested by our own backend the same way
    /// SwapKings attests pump.fun founder wallets — the score math itself
    /// still happens on-chain and can't be faked once a price is submitted.
    pub authority: Pubkey,
    pub id: u64,
    pub entry_fee_lamports: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    /// Number of distinct picked mints that have had a start price
    /// registered via `register_asset_price` — set lazily, after
    /// `start_ts`, only for mints someone actually picked (see that
    /// instruction's own comment), not a pre-registered catalog.
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
    /// Running total of every `set_prize` call so far — never allowed to exceed
    /// `distributed_pool_lamports` (see `set_prize`'s own comment).
    pub prizes_assigned_lamports: u64,
    /// Set once by `finish_prizes`, after every winning entry has its `prize_lamports`
    /// locked in. `claim_prize` and `close_entry` both require this — it is the line
    /// between "the authority is still writing the prize plan" and "money can move".
    pub prizes_finalized: bool,
    /// Pubkey::default() = native SOL, the vault is a plain lamport-holding PDA exactly
    /// as before. Any other value is an SPL mint: the vault's SPL token account (a
    /// canonical ATA owned by the `vault` PDA) holds the pool instead, and every
    /// `_lamports`-named amount field on this account/its entries is really "smallest
    /// units of this mint" — kept as `_lamports` in the field name so no existing byte
    /// offset or client decoder shifts.
    pub mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TournamentStatus {
    Open,
    Finalized,
    /// Called off because some entries could never be settled (a coin's price
    /// couldn't be recorded). Every entry gets its fee back via `refund_entry`;
    /// nothing is paid out. Appended last so existing on-chain tournaments
    /// keep decoding (Open = 0, Finalized = 1).
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EntryMode {
    Single,
    Multiple,
}

/// One shared start/end price per (tournament, mint) — deliberately NOT
/// per-entry. Every player who picked this mint, whenever during the entry
/// window they actually clicked "enter", scores from the exact same
/// reference price, captured once at (or after) `start_ts`. Registered
/// lazily by `register_asset_price`, not pre-created for every candidate a
/// player might browse — see that instruction's comment for why.
#[account]
#[derive(InitSpace)]
pub struct AssetPrice {
    pub tournament: Pubkey,
    pub mint: Pubkey,
    pub start_price_micros: u64,
    pub end_price_micros: u64,
    pub resolved: bool,
    pub bump: u8,
    /// Who paid this account's rent — the first player to pick the coin (created inside
    /// `enter_tournament`). `close_asset_price` gives it back to them after the tournament.
    pub payer: Pubkey,
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
    /// Raw mint addresses the player picked — NOT references to a
    /// pre-registered on-chain asset account (there isn't one at pick
    /// time; see `enter_tournament`'s Ed25519-attestation comment for why
    /// that's no longer needed).
    pub picks: [Pubkey; PICKS_PER_ENTRY],
    pub fp_spent: u32,
    pub score_bps: i32,
    pub settled: bool,
    pub claimed: bool,
    /// Unix timestamp this entry was created — the tiebreaker when two
    /// entries land on the exact same score_bps: the earlier `created_at`
    /// ranks higher, since drafting first (with less information about
    /// what everyone else is doing) is the harder feat. Purely a ranking
    /// input; doesn't affect anyone's score itself.
    pub created_at: i64,
    pub bump: u8,
    /// What this entry is owed, set by `set_prize` once the tournament is finalized and the
    /// off-chain ranking/tie-grouping is done — 0 if it didn't place. `claim_prize` pays out
    /// exactly this (no more on-chain arithmetic): a flat equal share for a 50%/PvP structure,
    /// a tiered amount for Top 1/Top 3/30%. See settlement.ts's `computePrizes`.
    pub prize_lamports: u64,
}
