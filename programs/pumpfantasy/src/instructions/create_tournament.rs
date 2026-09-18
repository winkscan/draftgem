use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateTournament<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Tournament::INIT_SPACE,
        seeds = [TOURNAMENT_SEED, id.to_le_bytes().as_ref()],
        bump
    )]
    pub tournament: Account<'info, Tournament>,

    /// PDA-owned SOL vault holding entry fees. Never given a withdraw
    /// instruction of its own — the only way lamports leave it is via
    /// `claim_prize`, signed by the program using these same seeds.
    #[account(
        seeds = [VAULT_SEED, tournament.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_tournament(
    ctx: Context<CreateTournament>,
    id: u64,
    entry_fee_lamports: u64,
    start_ts: i64,
    end_ts: i64,
    entry_mode: EntryMode,
    guaranteed_amount_lamports: u64,
) -> Result<()> {
    require!(end_ts > start_ts, PumpFantasyError::NotEnded);

    let tournament = &mut ctx.accounts.tournament;
    tournament.authority = ctx.accounts.authority.key();
    tournament.id = id;
    tournament.entry_fee_lamports = entry_fee_lamports;
    tournament.start_ts = start_ts;
    tournament.end_ts = end_ts;
    tournament.asset_count = 0;
    tournament.entry_count = 0;
    tournament.settled_count = 0;
    tournament.prize_pool_lamports = 0;
    tournament.status = TournamentStatus::Open;
    tournament.winners_count = 0;
    tournament.threshold_score_bps = 0;
    tournament.distributed_pool_lamports = 0;
    tournament.entry_mode = entry_mode;
    tournament.guaranteed_amount_lamports = guaranteed_amount_lamports;
    tournament.vault_bump = ctx.bumps.vault;
    tournament.bump = ctx.bumps.tournament;

    msg!("Tournament {} created", id);
    Ok(())
}
