use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct RegisterAssetPrice<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        init,
        payer = authority,
        space = 8 + AssetPrice::INIT_SPACE,
        seeds = [ASSET_SEED, tournament.key().as_ref(), mint.as_ref()],
        bump
    )]
    pub asset: Account<'info, AssetPrice>,

    pub system_program: Program<'info, System>,
}

/// Deliberately lazy, not a pre-registered catalog: with picks no longer
/// requiring an existing on-chain asset account (see `enter_tournament`),
/// a player can draft from the full off-chain candidate pool (thousands of
/// real tokens) without this program ever knowing about most of them. Only
/// mints someone actually picked need a shared reference price at all, and
/// only once entries are locked — hence the `start_ts` gate below, which
/// is what guarantees every player who picked this mint (whether at minute
/// 1 of the entry window or minute 19) scores from the exact same
/// reference point, not whatever the price happened to be when they
/// personally clicked "enter".
pub fn handle_register_asset_price(
    ctx: Context<RegisterAssetPrice>,
    _mint: Pubkey,
    start_price_micros: u64,
) -> Result<()> {
    require!(
        Clock::get()?.unix_timestamp >= ctx.accounts.tournament.start_ts,
        PumpFantasyError::TooEarlyToRegisterPrice
    );
    require!(start_price_micros > 0, PumpFantasyError::AssetNotResolved);

    let asset = &mut ctx.accounts.asset;
    asset.tournament = ctx.accounts.tournament.key();
    asset.mint = _mint;
    asset.start_price_micros = start_price_micros;
    asset.end_price_micros = 0;
    asset.resolved = false;
    asset.bump = ctx.bumps.asset;

    ctx.accounts.tournament.asset_count += 1;
    Ok(())
}
