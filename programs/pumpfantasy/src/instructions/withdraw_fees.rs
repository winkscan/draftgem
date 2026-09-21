use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    /// Signs, and receives the platform's share.
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
        mut,
        seeds = [VAULT_SEED, tournament.key().as_ref()],
        bump = tournament.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Receives the creator's share (the tournament's creator; may be the same
    /// account as `authority` when `creator_lamports` is 0).
    #[account(mut)]
    pub creator: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Pays out what `finalize_tournament` held back from the winners: the platform
/// rake (to the authority wallet) and, for a player-made tournament, the
/// creator's cut (to the creator).
///
/// Safe for the winners at any moment after finalizing: the fees are exactly
/// `prize_pool - distributed_pool`, so the vault keeps every winner's share, and
/// one rent-exempt minimum is always left in it (so the last `claim_prize` never
/// hits its rent-minimum clamp). It can only run once per amount: it lowers
/// `prize_pool_lamports` by what it paid, so a second call finds nothing to pay.
///
/// The authority chooses `creator_lamports` but cannot overpay: at most the part
/// of the fees above the platform's own rake (the creator cut), and never more
/// than is spendable. Under-paying the creator is possible, so the creator's
/// share is a matter of trust in the authority, like the price attestations.
pub fn handle_withdraw_fees(ctx: Context<WithdrawFees>, creator_lamports: u64) -> Result<()> {
    let tournament = &mut ctx.accounts.tournament;
    require!(
        tournament.status == TournamentStatus::Finalized,
        PumpFantasyError::NotFinalized
    );

    let pool = tournament.prize_pool_lamports;
    let total_fees = pool.saturating_sub(tournament.distributed_pool_lamports);
    let rent_minimum = Rent::get()?.minimum_balance(0);
    let spendable = total_fees.saturating_sub(rent_minimum);
    require!(spendable > 0, PumpFantasyError::NothingToWithdraw);

    let platform_rake = ((pool as u128) * (RAKE_BPS as u128) / (BPS_DENOMINATOR as u128)) as u64;
    let creator_cap = total_fees.saturating_sub(platform_rake).min(spendable);
    require!(
        creator_lamports <= creator_cap,
        PumpFantasyError::CreatorShareTooLarge
    );
    let platform_lamports = spendable - creator_lamports;

    let tournament_key = tournament.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, tournament_key.as_ref(), &[tournament.vault_bump]];
    let signer_seeds = [vault_seeds];

    for (to, lamports) in [
        (ctx.accounts.creator.to_account_info(), creator_lamports),
        (ctx.accounts.authority.to_account_info(), platform_lamports),
    ] {
        if lamports == 0 {
            continue;
        }
        let cpi_ctx = CpiContext::new_with_signer(
            anchor_lang::system_program::ID,
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to,
            },
            &signer_seeds,
        );
        anchor_lang::system_program::transfer(cpi_ctx, lamports)?;
    }

    tournament.prize_pool_lamports = pool - spendable;
    Ok(())
}
