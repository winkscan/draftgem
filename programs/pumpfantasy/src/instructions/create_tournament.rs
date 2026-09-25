use anchor_lang::prelude::*;

use crate::{constants::*, currency, error::PumpFantasyError, state::*};

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateTournament<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Tournament::INIT_SPACE,
        seeds = [TOURNAMENT_SEED, id.to_le_bytes().as_ref()],
        bump
    )]
    pub tournament: Account<'info, Tournament>,

    /// PDA-owned SOL vault holding entry fees when the tournament is native SOL. Never given
    /// a withdraw instruction of its own — the only way lamports leave it is via
    /// `claim_prize`, signed by the program using these same seeds. Unused (but still passed,
    /// as this same PDA) for an SPL-mint tournament — `vault_token_account` holds the pool
    /// instead, with this PDA as its token-account authority.
    #[account(
        seeds = [VAULT_SEED, tournament.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// The vault's ATA for `mint` — only created (and only matters) when `mint` isn't native
    /// SOL. Pass any account (e.g. `vault` again) as a harmless placeholder for a native
    /// tournament; the handler never touches it in that case.
    /// CHECK: validated against the ATA program's own derivation inside `create_ata_idempotent`
    /// (the CPI itself fails if this address doesn't match), and only used when mint is set.
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// The SPL mint this tournament is denominated in, or any account when native SOL.
    /// CHECK: only read (owner + decimals) when `mint_key != Pubkey::default()`.
    pub mint_account: UncheckedAccount<'info>,

    /// CHECK: must equal the SPL Token program when the tournament is SPL-denominated;
    /// unused for native SOL.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: must equal the Associated Token Account program when SPL-denominated; unused
    /// for native SOL.
    pub associated_token_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_create_tournament(
    ctx: Context<CreateTournament>,
    id: u64,
    entry_fee_lamports: u64,
    start_ts: i64,
    end_ts: i64,
    entry_mode: EntryMode,
    guaranteed_amount_lamports: u64,
    mint: Pubkey,
) -> Result<()> {
    #[cfg(feature = "mainnet")]
    require_keys_eq!(ctx.accounts.authority.key(), PLATFORM_AUTHORITY, PumpFantasyError::Unauthorized);

    require!(end_ts > start_ts, PumpFantasyError::NotEnded);

    if !currency::is_native(&mint) {
        require_keys_eq!(mint, ctx.accounts.mint_account.key(), PumpFantasyError::TokenAccountMintMismatch);
        require_keys_eq!(ctx.accounts.token_program.key(), spl_token_interface::ID, PumpFantasyError::WrongTokenProgram);
        require_keys_eq!(
            ctx.accounts.associated_token_program.key(),
            spl_associated_token_account_interface::program::ID,
            PumpFantasyError::WrongTokenProgram
        );
        currency::unpack_mint(&ctx.accounts.mint_account.to_account_info())?;
        currency::create_ata_idempotent(
            &ctx.accounts.authority.to_account_info(),
            &ctx.accounts.vault_token_account.to_account_info(),
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.mint_account.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
        )?;
    }

    let tournament = &mut ctx.accounts.tournament;
    tournament.authority = ctx.accounts.authority.key();
    tournament.id = id;
    tournament.entry_fee_lamports = entry_fee_lamports;
    tournament.start_ts = start_ts;
    tournament.end_ts = end_ts;
    tournament.asset_count = 0;
    tournament.entry_count = 0;
    tournament.settled_count = 0;
    tournament.prize_pool_lamports = 0;
    tournament.status = TournamentStatus::Open;
    tournament.winners_count = 0;
    tournament.threshold_score_bps = 0;
    tournament.distributed_pool_lamports = 0;
    tournament.entry_mode = entry_mode;
    tournament.guaranteed_amount_lamports = guaranteed_amount_lamports;
    tournament.vault_bump = ctx.bumps.vault;
    tournament.bump = ctx.bumps.tournament;
    tournament.mint = mint;

    msg!("Tournament {} created", id);
    Ok(())
}
