use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct RefundEntry<'info> {
    /// Permissionless, like `claim_prize`: anyone can trigger the refund, but
    /// the destination is locked to `entry.player` below.
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

    /// CHECK: refund destination, constrained to equal `entry.player` above.
    #[account(mut)]
    pub player: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Returns one entry's fee from a cancelled tournament's vault. Reuses the
/// entry's `claimed` flag as "already paid back" so a fee can't be taken twice.
pub fn handle_refund_entry(ctx: Context<RefundEntry>) -> Result<()> {
    let tournament = &ctx.accounts.tournament;

    require!(
        tournament.status == TournamentStatus::Cancelled,
        PumpFantasyError::NotCancelled
    );
    require!(!ctx.accounts.entry.claimed, PumpFantasyError::AlreadyClaimed);

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
    anchor_lang::system_program::transfer(cpi_ctx, tournament.entry_fee_lamports)?;

    ctx.accounts.entry.claimed = true;
    Ok(())
}
