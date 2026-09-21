use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct CloseAssetPrice<'info> {
    /// Permissionless: anyone can tidy up, the rent can only go to whoever paid it.
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        close = payer,
        constraint = asset.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
        constraint = asset.payer == payer.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub asset: Account<'info, AssetPrice>,

    /// CHECK: rent destination, constrained to equal `asset.payer` above.
    #[account(mut)]
    pub payer: UncheckedAccount<'info>,
}

/// Gives a coin's account rent back to the player who paid it. Only after the
/// tournament is finalized (every entry is settled, nobody needs the prices any
/// more) or cancelled (nothing will ever be scored).
pub fn handle_close_asset_price(ctx: Context<CloseAssetPrice>) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    require!(
        tournament.status == TournamentStatus::Finalized || tournament.status == TournamentStatus::Cancelled,
        PumpFantasyError::NotClosable
    );
    tournament.asset_count = tournament.asset_count.saturating_sub(1);
    Ok(())
}
