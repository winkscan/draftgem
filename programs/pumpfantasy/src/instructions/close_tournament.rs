use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct CloseTournament<'info> {
    /// Signs, and gets back the rent it paid to create the tournament (plus whatever
    /// dust is left in the vault).
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
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

    pub system_program: Program<'info, System>,
}

/// The last step of a tournament's life: take the account away and get its rent back.
///
/// Only when nothing can be lost by it:
/// - every Entry is closed (`entry_count == 0`) and every asset account is closed
///   (`asset_count == 0`) — so no player's rent is stranded behind a vanished tournament;
/// - it is over: Finalized (with the fees already withdrawn, so the creator's cut can't be
///   swept away with the rest) or Cancelled (refunds done), or it never had a single entry
///   and its entry window has closed;
/// - the vault holds nothing but its rent reserve (all prizes / refunds are out).
pub fn handle_close_tournament(ctx: Context<CloseTournament>) -> Result<()> {
    let tournament = &ctx.accounts.tournament;
    let now = Clock::get()?.unix_timestamp;
    let rent_minimum = Rent::get()?.minimum_balance(0);

    require!(
        tournament.entry_count == 0 && tournament.asset_count == 0,
        PumpFantasyError::TournamentNotClosable
    );
    match tournament.status {
        // Never had entries (they are locked from start_ts on): nothing to settle, nothing to pay.
        TournamentStatus::Open => require!(now >= tournament.start_ts, PumpFantasyError::TournamentNotClosable),
        TournamentStatus::Finalized => {
            require!(tournament.prizes_finalized, PumpFantasyError::TournamentNotClosable);
            let unwithdrawn_fees = tournament
                .prize_pool_lamports
                .saturating_sub(tournament.distributed_pool_lamports);
            require!(unwithdrawn_fees <= rent_minimum, PumpFantasyError::TournamentNotClosable);
        }
        TournamentStatus::Cancelled => {}
    }

    let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
    // Each winner's share is rounded down, so up to `winners_count` lamports can be left over.
    let dust_allowance = FEE_DUST_LAMPORTS + tournament.winners_count as u64;
    require!(
        vault_lamports <= rent_minimum + dust_allowance,
        PumpFantasyError::TournamentNotClosable
    );

    // Sweep the vault's leftover (the rent reserve, plus rounding dust) to the authority.
    if vault_lamports > 0 {
        let tournament_key = tournament.key();
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, tournament_key.as_ref(), &[tournament.vault_bump]];
        let signer_seeds = [vault_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            anchor_lang::system_program::ID,
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.authority.to_account_info(),
            },
            &signer_seeds,
        );
        anchor_lang::system_program::transfer(cpi_ctx, vault_lamports)?;
    }
    Ok(())
}
