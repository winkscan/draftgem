use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct AddAsset<'info> {
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
        space = 8 + TournamentAsset::INIT_SPACE,
        seeds = [ASSET_SEED, tournament.key().as_ref(), mint.as_ref()],
        bump
    )]
    pub asset: Account<'info, TournamentAsset>,

    pub system_program: Program<'info, System>,
}

pub fn handle_add_asset(
    ctx: Context<AddAsset>,
    mint: Pubkey,
    fp_cost: u32,
    start_price_micros: u64,
) -> Result<()> {
    require!(
        ctx.accounts.tournament.status == TournamentStatus::Open,
        PumpFantasyError::EntriesClosed
    );
    require!(fp_cost > 0, PumpFantasyError::BudgetExceeded);
    require!(start_price_micros > 0, PumpFantasyError::AssetNotResolved);

    let asset = &mut ctx.accounts.asset;
    asset.tournament = ctx.accounts.tournament.key();
    asset.mint = mint;
    asset.fp_cost = fp_cost;
    asset.start_price_micros = start_price_micros;
    asset.end_price_micros = 0;
    asset.resolved = false;
    asset.bump = ctx.bumps.asset;

    ctx.accounts.tournament.asset_count += 1;
    Ok(())
}
