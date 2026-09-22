use anchor_lang::prelude::*;

use crate::{constants::*, currency, error::PumpFantasyError, state::*};

#[derive(Accounts)]
pub struct RefundEntry<'info> {
    /// Permissionless, like `claim_prize`: anyone can trigger the refund, but
    /// the destination is locked to `entry.player` below.
    pub cranker: Signer<'info>,

    #[account(
        mut,
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

    /// The player's own token account for `tournament.mint` — only used for an SPL
    /// tournament. CHECK: unpacked and validated in the handler when used.
    #[account(mut)]
    pub player_token_account: UncheckedAccount<'info>,

    /// CHECK: only read (for `decimals`) for an SPL tournament.
    pub mint_account: UncheckedAccount<'info>,

    /// CHECK: must equal the SPL Token program for an SPL tournament; unused for native SOL.
    pub token_program: UncheckedAccount<'info>,

    // Closed on refund: the account's rent (paid by the player when they
    // entered) goes back to them along with the fee, and a closed account
    // can't be refunded twice.
    #[account(
        mut,
        close = player,
        constraint = entry.tournament == tournament.key() @ PumpFantasyError::AssetMismatch,
        constraint = entry.player == player.key() @ PumpFantasyError::AssetMismatch,
    )]
    pub entry: Account<'info, Entry>,

    /// CHECK: refund destination, constrained to equal `entry.player` above.
    #[account(mut)]
    pub player: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Returns one entry's fee from a cancelled tournament's vault and closes the
/// entry, handing its rent back too.
pub fn handle_refund_entry(ctx: Context<RefundEntry>) -> Result<()> {
    let tournament = &ctx.accounts.tournament;

    require!(
        tournament.status == TournamentStatus::Cancelled,
        PumpFantasyError::NotCancelled
    );
    // A tournament that was already paid out can't reach this point (status
    // would be Finalized), so any still-open entry here is genuinely owed a refund.
    require!(!ctx.accounts.entry.claimed, PumpFantasyError::AlreadyClaimed);

    let tournament_key = tournament.key();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, tournament_key.as_ref(), &[tournament.vault_bump]];

    if currency::is_native(&tournament.mint) {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.player.to_account_info(),
        };
        let signer_seeds = [vault_seeds];
        let cpi_ctx = CpiContext::new_with_signer(anchor_lang::system_program::ID, cpi_accounts, &signer_seeds);
        anchor_lang::system_program::transfer(cpi_ctx, tournament.entry_fee_lamports)?;
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
            tournament.entry_fee_lamports,
            mint_state.decimals,
            Some(signer_seeds),
        )?;
    }

    // The entry is being closed: one fewer left to clean up (close_tournament needs this to reach 0).
    let tournament = &mut ctx.accounts.tournament;
    tournament.entry_count = tournament.entry_count.saturating_sub(1);
    Ok(())
}
