use anchor_lang::prelude::*;

use crate::{constants::*, error::PumpFantasyError, state::*};

#[derive(Accounts)]
#[instruction(entry_index: u16)]
pub struct EnterTournament<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

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

    #[account(
        init,
        payer = player,
        space = 8 + Entry::INIT_SPACE,
        seeds = [ENTRY_SEED, tournament.key().as_ref(), player.key().as_ref(), entry_index.to_le_bytes().as_ref()],
        bump
    )]
    pub entry: Account<'info, Entry>,

    pub system_program: Program<'info, System>,
    // remaining_accounts: exactly PICKS_PER_ENTRY TournamentAsset accounts,
    // one per chosen coin. Passed as remaining_accounts (not named fields)
    // since Anchor can't express "5 accounts of the same type" directly.
}

pub fn handle_enter_tournament(ctx: Context<EnterTournament>, entry_index: u16) -> Result<()> {
    let tournament = &ctx.accounts.tournament;
    let clock = Clock::get()?;

    require!(
        tournament.status == TournamentStatus::Open,
        PumpFantasyError::EntriesClosed
    );
    require!(clock.unix_timestamp < tournament.start_ts, PumpFantasyError::EntriesClosed);

    // Single mode only ever has one PDA to occupy (index 0) — the `init`
    // constraint above already blocks a second entry there once it exists,
    // but without this check a Single-mode tournament could still accept a
    // *first* entry at index 1, 2, ... since those PDAs start out empty.
    // This is what actually makes "Single" mean "one entry, full stop" on
    // -chain rather than just being a client-side convention.
    require!(
        tournament.entry_mode == EntryMode::Multiple || entry_index == 0,
        PumpFantasyError::SingleEntryOnly
    );

    require!(
        ctx.remaining_accounts.len() == PICKS_PER_ENTRY,
        PumpFantasyError::DuplicatePick
    );

    let mut picks = [Pubkey::default(); PICKS_PER_ENTRY];
    let mut total_fp: u32 = 0;

    for (i, asset_ai) in ctx.remaining_accounts.iter().enumerate() {
        let asset: Account<TournamentAsset> = Account::try_from(asset_ai)?;
        require_keys_eq!(asset.tournament, tournament.key(), PumpFantasyError::AssetMismatch);

        let pick_key = asset_ai.key();
        require!(!picks[..i].contains(&pick_key), PumpFantasyError::DuplicatePick);

        picks[i] = pick_key;
        total_fp = total_fp
            .checked_add(asset.fp_cost)
            .ok_or(PumpFantasyError::BudgetExceeded)?;
    }

    require!(total_fp <= MAX_BUDGET_FP, PumpFantasyError::BudgetExceeded);

    // Move the entry fee into the PDA-owned vault.
    let cpi_accounts = anchor_lang::system_program::Transfer {
        from: ctx.accounts.player.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(anchor_lang::system_program::ID, cpi_accounts);
    anchor_lang::system_program::transfer(cpi_ctx, tournament.entry_fee_lamports)?;

    let entry = &mut ctx.accounts.entry;
    entry.tournament = tournament.key();
    entry.player = ctx.accounts.player.key();
    entry.entry_index = entry_index;
    entry.picks = picks;
    entry.fp_spent = total_fp;
    entry.score_bps = 0;
    entry.settled = false;
    entry.claimed = false;
    entry.bump = ctx.bumps.entry;

    let tournament = &mut ctx.accounts.tournament;
    tournament.entry_count += 1;
    tournament.prize_pool_lamports += tournament.entry_fee_lamports;

    Ok(())
}
