use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct FinalizeTournament<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,
}

/// Ranking itself happens off-chain (the backend reads every `Entry`
/// account and works out who's in the winning half) — Solana has no cheap
/// way to sort an arbitrary number of on-chain accounts. What's trustless
/// here is everything downstream of that: `threshold_score_bps` is public
/// and checkable against every entry's on-chain `score_bps`, and the
/// payout math (`claim_prize`) is a fixed formula nobody, including the
/// authority, can move after this call.
pub fn handle_finalize_tournament(
    ctx: Context<FinalizeTournament>,
    winners_count: u32,
    threshold_score_bps: i32,
) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;

    require!(
        tournament.status == TournamentStatus::Open,
        PumpFantasyError::AlreadyFinalized
    );
    require!(
        tournament.settled_count == tournament.entry_count,
        PumpFantasyError::EntriesStillSettling
    );
    require!(winners_count > 0, PumpFantasyError::InvalidWinnersCount);

    let distributed = (tournament.prize_pool_lamports as u128)
        * (BPS_DENOMINATOR as u128 - RAKE_BPS as u128)
        / BPS_DENOMINATOR as u128;

    tournament.winners_count = winners_count;
    tournament.threshold_score_bps = threshold_score_bps;
    tournament.distributed_pool_lamports = distributed as u64;
    tournament.status = TournamentStatus::Finalized;

    Ok(())
}
