use anchor_lang::prelude::*;

use crate::{error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct SetPrize<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ PumpFantasyError::Unauthorized,
        seeds = [crate::constants::TOURNAMENT_SEED, tournament.id.to_le_bytes().as_ref()],
        bump = tournament.bump,
    )]
    pub tournament: Account<'info, Tournament>,

    #[account(
        mut,
        constraint = entry.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub entry: Account<'info, Entry>,
}

/// Writes one entry's prize amount, computed off-chain (see settlement.ts's `computePrizes`):
/// a flat equal share for a 50%/PvP tournament, a tiered amount for Top 1/Top 3/30% — ranking
/// and tie-grouping have no cheap on-chain equivalent (same reasoning as `finalize_tournament`'s
/// own comment), so this is authority-trusted the same way price attestations are.
///
/// What IS enforced on-chain: the running total of every `set_prize` call can never exceed
/// `distributed_pool_lamports` (the vault literally cannot be asked to pay out more than it was
/// ever given for prizes), and once `finish_prizes` locks the plan in, this can't be called again
/// — so a winner's prize can't be quietly changed after the fact. Callable more than once on the
/// same entry before that point (replaces the old value, adjusting the running total by the
/// difference) so a mistake can be corrected before anyone claims.
pub fn handle_set_prize(ctx: Context<SetPrize>, prize_lamports: u64) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    let entry = &mut ctx.accounts.entry;

    require!(tournament.status == TournamentStatus::Finalized, PumpFantasyError::NotFinalized);
    require!(!tournament.prizes_finalized, PumpFantasyError::PrizesAlreadyFinalized);
    require!(!entry.claimed, PumpFantasyError::AlreadyClaimed);

    let new_total = tournament
        .prizes_assigned_lamports
        .saturating_sub(entry.prize_lamports)
        .checked_add(prize_lamports)
        .ok_or(PumpFantasyError::PrizeBudgetExceeded)?;
    require!(
        new_total <= tournament.distributed_pool_lamports,
        PumpFantasyError::PrizeBudgetExceeded
    );

    tournament.prizes_assigned_lamports = new_total;
    entry.prize_lamports = prize_lamports;
    Ok(())
}
