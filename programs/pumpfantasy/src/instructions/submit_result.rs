use anchor_lang::prelude::*;

use crate::{error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct SubmitResult<'info> {
    pub authority: Signer<'info>,

    #[account(
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [crate::constants::TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        constraint = asset.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub asset: Account<'info, AssetPrice>,
}

pub fn handle_submit_result(ctx: Context<SubmitResult>, end_price_micros: u64) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.tournament.end_ts,
        PumpFantasyError::NotEnded
    );
    // end_price_micros == 0 is a legitimate result: the coin rugged/died.
    // The entry's score for that pick is floored at -100% (SCORE_FLOOR_BPS)
    // in `settle_entry`, never worse.

    let asset = &mut ctx.accounts.asset;
    asset.end_price_micros = end_price_micros;
    asset.resolved = true;
    Ok(())
}
