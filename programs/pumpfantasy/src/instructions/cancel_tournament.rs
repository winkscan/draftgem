use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct CancelTournament<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,
}

/// The escape hatch for a tournament that can never finish: `settle_entry`
/// needs every pick's start AND end price on-chain, and `finalize_tournament`
/// needs every entry settled, so one coin whose price can't be recorded would
/// otherwise lock every entrant's fee in the vault forever. After
/// CANCEL_GRACE_SECONDS past end_ts the authority can call it off, and each
/// entry then reclaims its fee through `refund_entry`.
///
/// Deliberately can't be used once every entry is settled: at that point the
/// results are fully known, so the authority can't void a tournament just
/// because it dislikes the outcome — it has to finalize.
pub fn handle_cancel_tournament(ctx: Context<CancelTournament>) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;

    require!(
        tournament.status == TournamentStatus::Open,
        PumpFantasyError::AlreadyFinalized
    );
    require!(
        Clock::get()?.unix_timestamp >= tournament.end_ts + CANCEL_GRACE_SECONDS,
        PumpFantasyError::TooEarlyToCancel
    );
    require!(
        tournament.settled_count < tournament.entry_count,
        PumpFantasyError::NothingToCancel
    );

    tournament.status = TournamentStatus::Cancelled;
    Ok(())
}
