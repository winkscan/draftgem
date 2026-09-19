use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    /// Permissionless caller — anyone can trigger the payout, but the
    /// destination is locked to `entry.player` below, so it can only ever
    /// pay the actual winner.
    pub cranker: Signer<'info>,

    #[account(
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

    #[account(
        mut,
        constraint = entry.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
        constraint = entry.player == player.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub entry: Account<'info, Entry>,

    /// CHECK: payout destination, constrained to equal `entry.player` above.
    #[account(mut)]
    pub player: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
    let tournament = &ctx.accounts.tournament;
    let entry = &ctx.accounts.entry;

    require!(
        tournament.status == TournamentStatus::Finalized,
        PumpFantasyError::NotFinalized
    );
    require!(entry.settled, PumpFantasyError::NotSettled);
    require!(!entry.claimed, PumpFantasyError::AlreadyClaimed);
    require!(
        entry.score_bps >= tournament.threshold_score_bps,
        PumpFantasyError::NotAWinner
    );

    let mut payout = tournament.distributed_pool_lamports / tournament.winners_count as u64;

    // A system account (the vault) may not be left holding more than 0 but
    // less than the rent-exempt minimum, or the transfer fails. Normally the
    // 5% rake covers that, but with a single entry (or a tiny pool) it doesn't
    // — the winner's own claim would then be impossible and their prize stuck
    // forever. When this payout would strand such a sliver, pay it out too
    // (only ever happens on the last claim: earlier ones leave other winners'
    // shares in the vault).
    let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
    let rent_minimum = Rent::get()?.minimum_balance(0);
    if vault_lamports > payout && vault_lamports - payout < rent_minimum {
        payout = vault_lamports;
    }

    let tournament_key = tournament.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, tournament_key.as_ref(), &[tournament.vault_bump]];

    let cpi_accounts = anchor_lang::system_program::Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.player.to_account_info(),
    };
    let signer_seeds = [vault_seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        anchor_lang::system_program::ID,
        cpi_accounts,
        &signer_seeds,
    );
    anchor_lang::system_program::transfer(cpi_ctx, payout)?;

    ctx.accounts.entry.claimed = true;

    Ok(())
}
