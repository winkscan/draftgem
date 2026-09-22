use anchor_lang::prelude::*;

use crate::{error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct FinishPrizes<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [crate::constants::TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,
}

/// Locks the prize plan in: after this, `set_prize` can never touch this tournament again, and
/// `claim_prize`/`close_entry` are unblocked. Separate from `finalize_tournament` because writing
/// every winning entry's `set_prize` takes many transactions for a tournament with a lot of
/// winners — this is the one call that says "that whole batch is done, safe to pay out".
pub fn handle_finish_prizes(ctx: Context<FinishPrizes>) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    require!(tournament.status == TournamentStatus::Finalized, PumpFantasyError::NotFinalized);
    require!(!tournament.prizes_finalized, PumpFantasyError::PrizesAlreadyFinalized);
    tournament.prizes_finalized = true;
    Ok(())
}
