use anchor_lang::prelude::*;
// anchor-lang 1.1.2 doesn't re-export either of these itself (same finding
// as SwapKings' join_guild.rs — its solana_program::sysvar::instructions
// only re-exports the Borrowed-instruction loader, no ed25519_program
// module), so both come straight from the underlying Solana SDK crates.
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};
use solana_sdk_ids::ed25519_program;

use anchor_lang::system_program::{allocate, assign, create_account, transfer, Allocate, Assign, CreateAccount, Transfer};
use anchor_lang::Discriminator;

use crate::{constants::*, currency, error::PumpFantasyError, state::*};

// Same native Ed25519Program instruction layout SwapKings' join_guild.rs
// already confirmed live (both @solana/web3.js's Ed25519Program helper and
// Solana's own Rust-side one use this byte order).
const ED25519_HEADER_LEN: usize = 16;
const ED25519_PUBKEY_OFFSET: usize = ED25519_HEADER_LEN;
const ED25519_PUBKEY_LEN: usize = 32;
const ED25519_SIGNATURE_OFFSET: usize = ED25519_PUBKEY_OFFSET + ED25519_PUBKEY_LEN;
const ED25519_SIGNATURE_LEN: usize = 64;
const ED25519_MESSAGE_OFFSET: usize = ED25519_SIGNATURE_OFFSET + ED25519_SIGNATURE_LEN;

/// Rebuilds the exact byte message the backend must have signed for THESE
/// picks/fp_costs/expiry, so `verify_attestation` can check the actually-
/// signed message matches — not just that *some* valid attestation from
/// our signer is present in the transaction.
fn attestation_message(picks: &[Pubkey; PICKS_PER_ENTRY], fp_costs: &[u32; PICKS_PER_ENTRY], expiry: i64) -> Vec<u8> {
    let mut msg = Vec::with_capacity(8 + PICKS_PER_ENTRY * 36);
    msg.extend_from_slice(&expiry.to_le_bytes());
    for i in 0..PICKS_PER_ENTRY {
        msg.extend_from_slice(picks[i].as_ref());
        msg.extend_from_slice(&fp_costs[i].to_le_bytes());
    }
    msg
}

/// Confirms a native ed25519_program instruction attesting EXACTLY
/// `ATTESTATION_SIGNER` signed this exact (picks, fp_costs, expiry) tuple
/// sits immediately before this instruction in the same transaction.
/// Doesn't re-verify the signature itself — the runtime already rejects
/// the whole transaction before this handler ever runs if that native
/// instruction's signature doesn't check out; this only confirms the
/// RIGHT attestation (right signer, right message) was actually there.
fn verify_attestation(
    instructions_sysvar: &AccountInfo,
    picks: &[Pubkey; PICKS_PER_ENTRY],
    fp_costs: &[u32; PICKS_PER_ENTRY],
    expiry: i64,
) -> Result<()> {
    let current_index =
        load_current_index_checked(instructions_sysvar).map_err(|_| error!(PumpFantasyError::MissingAttestation))?;
    require!(current_index > 0, PumpFantasyError::MissingAttestation);

    let ix = load_instruction_at_checked((current_index - 1) as usize, instructions_sysvar)
        .map_err(|_| error!(PumpFantasyError::MissingAttestation))?;
    require_keys_eq!(ix.program_id, ed25519_program::ID, PumpFantasyError::MissingAttestation);

    let expected_message = attestation_message(picks, fp_costs, expiry);
    let data = &ix.data;
    require!(
        data.len() == ED25519_MESSAGE_OFFSET + expected_message.len(),
        PumpFantasyError::MissingAttestation
    );
    require!(
        &data[ED25519_PUBKEY_OFFSET..ED25519_PUBKEY_OFFSET + ED25519_PUBKEY_LEN] == ATTESTATION_SIGNER.as_ref(),
        PumpFantasyError::MissingAttestation
    );
    require!(
        &data[ED25519_MESSAGE_OFFSET..] == expected_message.as_slice(),
        PumpFantasyError::MissingAttestation
    );
    Ok(())
}

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

    /// The vault's SPL token account — only used (and required to actually be it) when
    /// `tournament.mint` isn't native SOL. Pass any account as a placeholder otherwise.
    /// CHECK: unpacked and checked against `tournament.mint`/`vault` in the handler when used.
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    /// The player's own token account for `tournament.mint`, source of the entry fee.
    /// Only used for an SPL tournament — the player is responsible for it already existing
    /// (e.g. their ATA, created client-side in the same transaction if needed).
    /// CHECK: unpacked and checked (mint + owner == player) in the handler when used.
    #[account(mut)]
    pub player_token_account: UncheckedAccount<'info>,

    /// CHECK: only read (for `decimals`) when `tournament.mint` isn't native SOL.
    pub mint_account: UncheckedAccount<'info>,

    /// CHECK: must equal the SPL Token program for an SPL tournament; unused for native SOL.
    pub token_program: UncheckedAccount<'info>,

    #[account(
        init,
        payer = player,
        space = 8 + Entry::INIT_SPACE,
        seeds = [ENTRY_SEED, tournament.key().as_ref(), player.key().as_ref(), entry_index.to_le_bytes().as_ref()],
        bump
    )]
    pub entry: Account<'info, Entry>,

    /// CHECK: the sysvar this program reads to introspect the
    /// ed25519_program attestation instruction — pinned to the real
    /// Instructions sysvar address, never any other account.
    #[account(address = solana_sdk_ids::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_enter_tournament<'info>(
    ctx: Context<'info, EnterTournament<'info>>,
    entry_index: u16,
    picks: [Pubkey; PICKS_PER_ENTRY],
    fp_costs: [u32; PICKS_PER_ENTRY],
    attestation_expiry: i64,
) -> Result<()> {
    let tournament = &ctx.accounts.tournament;
    let clock = Clock::get()?;

    require!(
        tournament.status == TournamentStatus::Open,
        PumpFantasyError::EntriesClosed
    );
    require!(clock.unix_timestamp < tournament.start_ts, PumpFantasyError::EntriesClosed);
    require!(clock.unix_timestamp < attestation_expiry, PumpFantasyError::AttestationExpired);

    // Single mode only ever has one PDA to occupy (index 0) — the `init`
    // constraint above already blocks a second entry there once it exists,
    // but without this check a Single-mode tournament could still accept a
    // *first* entry at index 1, 2, ... since those PDAs start out empty.
    require!(
        tournament.entry_mode == EntryMode::Multiple || entry_index == 0,
        PumpFantasyError::SingleEntryOnly
    );

    for i in 0..PICKS_PER_ENTRY {
        require!(!picks[..i].contains(&picks[i]), PumpFantasyError::DuplicatePick);
    }

    verify_attestation(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &picks,
        &fp_costs,
        attestation_expiry,
    )?;

    let mut total_fp: u32 = 0;
    for cost in fp_costs {
        total_fp = total_fp.checked_add(cost).ok_or(PumpFantasyError::BudgetExceeded)?;
    }
    require!(total_fp <= MAX_BUDGET_FP, PumpFantasyError::BudgetExceeded);

    // Each picked coin needs a shared price account. The first entry to pick a coin creates it and
    // PAYS its rent (recorded in `payer`); everyone after that finds it already there and pays
    // nothing. The rent comes back to the payer when the tournament is over (`close_asset_price`),
    // so the platform never fronts it. remaining_accounts: the five AssetPrice PDAs in pick order.
    require!(
        ctx.remaining_accounts.len() == PICKS_PER_ENTRY,
        PumpFantasyError::AssetNotInEntry
    );
    let tournament_key = tournament.key();
    let space = 8 + AssetPrice::INIT_SPACE;
    let required_lamports = Rent::get()?.minimum_balance(space);
    let mut created_assets: u16 = 0;
    for i in 0..PICKS_PER_ENTRY {
        let asset_ai = &ctx.remaining_accounts[i];
        let (expected, bump) = Pubkey::find_program_address(
            &[ASSET_SEED, tournament_key.as_ref(), picks[i].as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(asset_ai.key(), expected, PumpFantasyError::AssetNotInEntry);
        if asset_ai.owner == ctx.program_id && !asset_ai.data_is_empty() {
            continue; // an earlier entry already picked this coin
        }

        let seeds: &[&[u8]] = &[ASSET_SEED, tournament_key.as_ref(), picks[i].as_ref(), &[bump]];
        let signer_seeds = [seeds];
        let current = asset_ai.lamports();
        if current == 0 {
            create_account(
                CpiContext::new_with_signer(
                    anchor_lang::system_program::ID,
                    CreateAccount { from: ctx.accounts.player.to_account_info(), to: asset_ai.clone() },
                    &signer_seeds,
                ),
                required_lamports,
                space as u64,
                ctx.program_id,
            )?;
        } else {
            // Someone sent lamports to this address beforehand: create_account would fail, so
            // top up, allocate and assign instead (what Anchor's own `init` does).
            if current < required_lamports {
                transfer(
                    CpiContext::new(
                        anchor_lang::system_program::ID,
                        Transfer { from: ctx.accounts.player.to_account_info(), to: asset_ai.clone() },
                    ),
                    required_lamports - current,
                )?;
            }
            allocate(
                CpiContext::new_with_signer(
                    anchor_lang::system_program::ID,
                    Allocate { account_to_allocate: asset_ai.clone() },
                    &signer_seeds,
                ),
                space as u64,
            )?;
            assign(
                CpiContext::new_with_signer(
                    anchor_lang::system_program::ID,
                    Assign { account_to_assign: asset_ai.clone() },
                    &signer_seeds,
                ),
                ctx.program_id,
            )?;
        }

        let asset = AssetPrice {
            tournament: tournament_key,
            mint: picks[i],
            start_price_micros: 0,
            end_price_micros: 0,
            resolved: false,
            bump,
            payer: ctx.accounts.player.key(),
        };
        let mut data = asset_ai.try_borrow_mut_data()?;
        data[..8].copy_from_slice(AssetPrice::DISCRIMINATOR);
        asset.serialize(&mut &mut data[8..])?;
        created_assets += 1;
    }

    // Move the entry fee into the PDA-owned vault — native SOL straight to the vault PDA, or
    // (for an SPL tournament) a checked token transfer into its ATA.
    if currency::is_native(&tournament.mint) {
        let cpi_accounts = anchor_lang::system_program::Transfer {
            from: ctx.accounts.player.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(anchor_lang::system_program::ID, cpi_accounts);
        anchor_lang::system_program::transfer(cpi_ctx, tournament.entry_fee_lamports)?;
    } else {
        currency::require_token_account(
            &ctx.accounts.player_token_account.to_account_info(),
            &tournament.mint,
            &ctx.accounts.player.key(),
        )?;
        let mint_state = currency::unpack_mint(&ctx.accounts.mint_account.to_account_info())?;
        currency::transfer_checked(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.player_token_account.to_account_info(),
            &ctx.accounts.mint_account.to_account_info(),
            &ctx.accounts.vault_token_account.to_account_info(),
            &ctx.accounts.player.to_account_info(),
            tournament.entry_fee_lamports,
            mint_state.decimals,
            None,
        )?;
    }

    let entry = &mut ctx.accounts.entry;
    entry.tournament = tournament.key();
    entry.player = ctx.accounts.player.key();
    entry.entry_index = entry_index;
    entry.picks = picks;
    entry.fp_spent = total_fp;
    entry.score_bps = 0;
    entry.settled = false;
    entry.claimed = false;
    entry.created_at = clock.unix_timestamp;
    entry.bump = ctx.bumps.entry;

    let tournament = &mut ctx.accounts.tournament;
    tournament.entry_count += 1;
    tournament.asset_count += created_assets; // now counts open asset accounts (close_tournament needs 0)
    tournament.prize_pool_lamports += tournament.entry_fee_lamports;

    Ok(())
}
