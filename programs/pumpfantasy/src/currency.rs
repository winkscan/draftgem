use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::program_pack::Pack;

use crate::error::PumpFantasyError;

/// Every `_lamports`-named amount on `Tournament`/`Entry` is really "smallest units of
/// `Tournament.mint`" once a tournament isn't native SOL — this sentinel marks the native
/// case (no real mint has the all-zero address, so it can never collide with a real one).
pub fn is_native(mint: &Pubkey) -> bool {
    *mint == Pubkey::default()
}

pub fn unpack_token_account(ai: &AccountInfo) -> Result<spl_token_interface::state::Account> {
    require_keys_eq!(*ai.owner, spl_token_interface::ID, PumpFantasyError::InvalidTokenAccount);
    let data = ai.try_borrow_data()?;
    spl_token_interface::state::Account::unpack(&data).map_err(|_| error!(PumpFantasyError::InvalidTokenAccount))
}

pub fn unpack_mint(ai: &AccountInfo) -> Result<spl_token_interface::state::Mint> {
    require_keys_eq!(*ai.owner, spl_token_interface::ID, PumpFantasyError::InvalidTokenAccount);
    let data = ai.try_borrow_data()?;
    spl_token_interface::state::Mint::unpack(&data).map_err(|_| error!(PumpFantasyError::InvalidTokenAccount))
}

/// Checks a token account is exactly what it's expected to be for this program's purposes:
/// the right mint, and held by the right owner (a wallet for a player/creator/authority
/// destination, or the `vault` PDA for the tournament's own pool).
pub fn require_token_account(ai: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> Result<()> {
    let acc = unpack_token_account(ai)?;
    require_keys_eq!(acc.mint, *mint, PumpFantasyError::TokenAccountMintMismatch);
    require_keys_eq!(acc.owner, *owner, PumpFantasyError::TokenAccountOwnerMismatch);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn transfer_checked<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let ix = spl_token_interface::instruction::transfer_checked(
        &spl_token_interface::ID,
        from.key,
        mint.key,
        to.key,
        authority.key,
        &[],
        amount,
        decimals,
    )
    .map_err(|_| error!(PumpFantasyError::InvalidTokenAccount))?;
    let accounts = [from.clone(), mint.clone(), to.clone(), authority.clone(), token_program.clone()];
    match signer_seeds {
        Some(seeds) => invoke_signed(&ix, &accounts, seeds)?,
        None => invoke(&ix, &accounts)?,
    }
    Ok(())
}

/// Creates `token_account` (the ATA of `owner` for `mint`) if it doesn't already exist,
/// paid for by `funding`. Used for the vault's own ATA in `create_tournament` — every
/// other token account (player/winner/creator/authority) is the CALLER's responsibility
/// to have ready before it hands the instruction to this program.
pub fn create_ata_idempotent<'info>(
    funding: &AccountInfo<'info>,
    token_account: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    associated_token_program: &AccountInfo<'info>,
) -> Result<()> {
    let ix = spl_associated_token_account_interface::instruction::create_associated_token_account_idempotent(
        funding.key,
        owner.key,
        mint.key,
        &spl_token_interface::ID,
    );
    let accounts = [
        funding.clone(),
        token_account.clone(),
        owner.clone(),
        mint.clone(),
        system_program.clone(),
        token_program.clone(),
        associated_token_program.clone(),
    ];
    invoke(&ix, &accounts)?;
    Ok(())
}

pub fn close_token_account<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = spl_token_interface::instruction::close_account(
        &spl_token_interface::ID,
        account.key,
        destination.key,
        authority.key,
        &[],
    )
    .map_err(|_| error!(PumpFantasyError::InvalidTokenAccount))?;
    let accounts = [account.clone(), destination.clone(), authority.clone(), token_program.clone()];
    invoke_signed(&ix, &accounts, signer_seeds)?;
    Ok(())
}
