use anchor_lang::prelude::*;

use crate::{constants::*, currency, error::PumpFantasyError, state::*};

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

    /// The vault's SPL token account — only used for an SPL tournament (pass any account
    /// otherwise). CHECK: unpacked and validated in the handler when used.
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// The authority's own token account for `tournament.mint` — only used for an SPL
    /// tournament. CHECK: unpacked and validated in the handler when used.
    #[account(mut)]
    pub authority_token_account: UncheckedAccount<'info>,

    /// The creator's own token account for `tournament.mint` — only used for an SPL
    /// tournament. CHECK: unpacked and validated in the handler when used.
    #[account(mut)]
    pub creator_token_account: UncheckedAccount<'info>,

    /// CHECK: only read (for `decimals`) for an SPL tournament.
    pub mint_account: UncheckedAccount<'info>,

    /// CHECK: must equal the SPL Token program for an SPL tournament; unused for native SOL.
    pub token_program: UncheckedAccount<'info>,

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
    require!(tournament.prizes_finalized, PumpFantasyError::PrizesNotFinalized);

    let pool = tournament.prize_pool_lamports;
    let total_fees = pool.saturating_sub(tournament.distributed_pool_lamports);
    // The "leave one rent-exempt minimum behind" reserve is a native-SOL concept (the vault
    // PDA's own lamport balance) — an SPL vault's token *amount* has nothing to do with its
    // account's rent, which is tracked separately in lamports, so the full fee is spendable.
    let rent_minimum = if currency::is_native(&tournament.mint) { Rent::get()?.minimum_balance(0) } else { 0 };
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

    if currency::is_native(&tournament.mint) {
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
                anchor_lang::system_program::Transfer { from: ctx.accounts.vault.to_account_info(), to },
                &signer_seeds,
            );
            anchor_lang::system_program::transfer(cpi_ctx, lamports)?;
        }
    } else {
        let mint_state = currency::unpack_mint(&ctx.accounts.mint_account.to_account_info())?;
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];
        for (to, dest_owner, amount) in [
            (ctx.accounts.creator_token_account.to_account_info(), ctx.accounts.creator.key(), creator_lamports),
            (ctx.accounts.authority_token_account.to_account_info(), ctx.accounts.authority.key(), platform_lamports),
        ] {
            if amount == 0 {
                continue;
            }
            currency::require_token_account(&to, &tournament.mint, &dest_owner)?;
            currency::transfer_checked(
                &ctx.accounts.token_program.to_account_info(),
                &ctx.accounts.vault_token_account.to_account_info(),
                &ctx.accounts.mint_account.to_account_info(),
                &to,
                &ctx.accounts.vault.to_account_info(),
                amount,
                mint_state.decimals,
                Some(signer_seeds),
            )?;
        }
    }

    tournament.prize_pool_lamports = pool - spendable;
    Ok(())
}
