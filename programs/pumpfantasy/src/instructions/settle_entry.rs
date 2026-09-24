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
    // remaining_accounts: the PICKS_PER_ENTRY AssetPrice PDAs for
    // entry.picks' mints, in the same order — derived from (tournament,
    // mint), not stored directly on the entry (picks are raw mints now,
    // see enter_tournament.rs).
}

pub fn handle_settle_entry(ctx: Context<SettleEntry>) -> Result<()> {
    require!(!ctx.accounts.entry.settled, PumpFantasyError::AlreadySettled);
    require!(
        ctx.remaining_accounts.len() == PICKS_PER_ENTRY,
        PumpFantasyError::AssetNotInEntry
    );

    let tournament_key = ctx.accounts.tournament.key();
    let mut total_bps: i64 = 0;

    for (i, asset_ai) in ctx.remaining_accounts.iter().enumerate() {
        let mint = ctx.accounts.entry.picks[i];
        let (expected_asset, _) =
            Pubkey::find_program_address(&[ASSET_SEED, tournament_key.as_ref(), mint.as_ref()], ctx.program_id);
        require_keys_eq!(asset_ai.key(), expected_asset, PumpFantasyError::AssetNotInEntry);

        let asset: Account<AssetPrice> = Account::try_from(asset_ai)?;
        require!(asset.resolved, PumpFantasyError::AssetNotResolved);

        let start = asset.start_price_micros as i64;
        let end = asset.end_price_micros as i64;
        let pct_bps = (end - start) * BPS_DENOMINATOR / start;
        total_bps += pct_bps.max(SCORE_FLOOR_BPS);
    }

    // Picks stack, they don't dilute each other — like daily fantasy sports, where a roster's
    // score is the sum of what each player scored, not the average. Buying 5 real coins with
    // separate capital works the same way: total P&L is each coin's own gain or loss added
    // together, not blended into one number. (Was divided by PICKS_PER_ENTRY; a strong pick used
    // to be worth less than it should — fixed 2026-09-24.)
    let entry = &mut ctx.accounts.entry;
    entry.score_bps = total_bps as i32;
    entry.settled = true;

    ctx.accounts.tournament.settled_count += 1;

    Ok(())
}
