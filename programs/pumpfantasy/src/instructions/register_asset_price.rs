use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct RegisterAssetPrice<'info> {
    pub authority: Signer<'info>,

    #[account(
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    /// Created (and its rent paid) by the first player to pick this coin, inside
    /// `enter_tournament`; here the authority only records the start price on it.
    #[account(
        mut,
        seeds = [ASSET_SEED, tournament.key().as_ref(), mint.as_ref()],
        bump = asset.bump,
        constraint = asset.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub asset: Account<'info, AssetPrice>,
}

/// Deliberately lazy, not a pre-registered catalog: a player can draft from the
/// full off-chain candidate pool (thousands of real tokens) without this program
/// knowing most of them. Only mints someone actually picked get an account
/// (made by `enter_tournament`, paid by the picker), and only once entries are
/// locked does it get a shared reference price — hence the `start_ts` gate below,
/// which guarantees every player who picked this mint (whether at minute 1 of the
/// entry window or minute 19) scores from the exact same reference point.
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
    require!(asset.start_price_micros == 0, PumpFantasyError::AssetAlreadyRegistered);
    asset.start_price_micros = start_price_micros;
    Ok(())
}
