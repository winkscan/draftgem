use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct CloseEntry<'info> {
    /// Permissionless: anyone can tidy up, the rent can only go to the player.
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        close = player,
        constraint = entry.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
        constraint = entry.player == player.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub entry: Account<'info, Entry>,

    /// CHECK: rent destination, constrained to equal `entry.player` above.
    #[account(mut)]
    pub player: UncheckedAccount<'info>,
}

/// Returns an entry's rent (paid by the player when they entered) once the
/// tournament is over and the entry can never matter again: it is settled, and
/// either it already collected its prize or it never qualified for one.
/// (Cancelled tournaments close their entries through `refund_entry` instead.)
pub fn handle_close_entry(ctx: Context<CloseEntry>) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    let entry = &ctx.accounts.entry;

    require!(tournament.status == TournamentStatus::Finalized, PumpFantasyError::NotClosable);
    require!(entry.settled, PumpFantasyError::EntryNotClosable);
    require!(
        entry.claimed || entry.score_bps < tournament.threshold_score_bps,
        PumpFantasyError::EntryNotClosable
    );

    tournament.entry_count = tournament.entry_count.saturating_sub(1);
    Ok(())
}
