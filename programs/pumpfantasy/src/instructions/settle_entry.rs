use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct SettleEntry<'info> {
    /// Permissionless crank — anyone can settle any entry once every pick
    /// has a submitted result. Payout math is locked to `entry.player`
    /// elsewhere, so there's nothing to gain by settling someone else's.
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        constraint = entry.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub entry: Account<'info, Entry>,
    // remaining_accounts: the same PICKS_PER_ENTRY TournamentAsset accounts
    // recorded in entry.picks, in the same order.
}

pub fn handle_settle_entry(ctx: Context<SettleEntry>) -> Result<()> {
    require!(!ctx.accounts.entry.settled, PumpFantasyError::AlreadySettled);
    require!(
        ctx.remaining_accounts.len() == PICKS_PER_ENTRY,
        PumpFantasyError::AssetNotInEntry
    );

    let mut total_bps: i64 = 0;

    for (i, asset_ai) in ctx.remaining_accounts.iter().enumerate() {
        require_keys_eq!(
            asset_ai.key(),
            ctx.accounts.entry.picks[i],
            PumpFantasyError::AssetNotInEntry
        );

        let asset: Account<TournamentAsset> = Account::try_from(asset_ai)?;
        require!(asset.resolved, PumpFantasyError::AssetNotResolved);

        let start = asset.start_price_micros as i64;
        let end = asset.end_price_micros as i64;
        let pct_bps = (end - start) * BPS_DENOMINATOR / start;
        total_bps += pct_bps.max(SCORE_FLOOR_BPS);
    }

    let entry = &mut ctx.accounts.entry;
    entry.score_bps = (total_bps / PICKS_PER_ENTRY as i64) as i32;
    entry.settled = true;

    ctx.accounts.tournament.settled_count += 1;

    Ok(())
}
