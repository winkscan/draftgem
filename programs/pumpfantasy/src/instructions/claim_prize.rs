use anchor_lang::prelude::*;

use crate::{constants::*, currency, error::PumpFantasyError, state::*};

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

    /// The vault's SPL token account — only used for an SPL tournament (pass any account
    /// otherwise). CHECK: unpacked and validated in the handler when used.
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// The winner's own token account for `tournament.mint` — only used for an SPL
    /// tournament; the cranker (in practice, the worker) is responsible for it already
    /// existing. CHECK: unpacked and validated in the handler when used.
    #[account(mut)]
    pub player_token_account: UncheckedAccount<'info>,

    /// CHECK: only read (for `decimals`) for an SPL tournament.
    pub mint_account: UncheckedAccount<'info>,

    /// CHECK: must equal the SPL Token program for an SPL tournament; unused for native SOL.
    pub token_program: UncheckedAccount<'info>,

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
    // The prize plan (set_prize, per entry) must be locked in — otherwise a winner's prize
    // hasn't necessarily been written yet, and 0 would wrongly look like "not a winner".
    require!(tournament.prizes_finalized, PumpFantasyError::PrizesNotFinalized);
    require!(entry.settled, PumpFantasyError::NotSettled);
    require!(!entry.claimed, PumpFantasyError::AlreadyClaimed);
    require!(entry.prize_lamports > 0, PumpFantasyError::NotAWinner);

    let mut payout = entry.prize_lamports;

    let tournament_key = tournament.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, tournament_key.as_ref(), &[tournament.vault_bump]];

    if currency::is_native(&tournament.mint) {
        // A system account (the vault) may not be left holding more than 0 but
        // less than the rent-exempt minimum, or the transfer fails. The 5% rake
        // normally covers that, but on a small pool (e.g. a single entry at a tiny
        // fee) it doesn't, and the winner's claim would be impossible — their
        // prize stuck forever. In that case pay out only what leaves the vault at
        // the rent-exempt minimum: the house keeps its rake (rounded up to that
        // minimum) and the winner is never blocked. Can only bite on the last
        // claim of a tournament; earlier ones leave other winners' shares behind.
        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        let rent_minimum = Rent::get()?.minimum_balance(0);
        if vault_lamports > payout && vault_lamports - payout < rent_minimum {
            payout = vault_lamports.saturating_sub(rent_minimum);
        }

        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.player.to_account_info(),
        };
        let signer_seeds = [vault_seeds];
        let cpi_ctx = CpiContext::new_with_signer(anchor_lang::system_program::ID, cpi_accounts, &signer_seeds);
        anchor_lang::system_program::transfer(cpi_ctx, payout)?;
    } else {
        currency::require_token_account(
            &ctx.accounts.player_token_account.to_account_info(),
            &tournament.mint,
            &ctx.accounts.player.key(),
        )?;
        let mint_state = currency::unpack_mint(&ctx.accounts.mint_account.to_account_info())?;
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
        currency::transfer_checked(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.vault_token_account.to_account_info(),
            &ctx.accounts.mint_account.to_account_info(),
            &ctx.accounts.player_token_account.to_account_info(),
            &ctx.accounts.vault.to_account_info(),
            payout,
            mint_state.decimals,
            Some(signer_seeds),
        )?;
    }

    ctx.accounts.entry.claimed = true;

    Ok(())
}
