// The `mainnet` cargo feature (constants.rs) restricts `create_tournament` to PLATFORM_AUTHORITY —
// added 2026-09-25 right after that day's self-audit, so it was never exercised by any test: the
// default build (used by every other test file here) doesn't even compile this check in. Found
// during a 2026-09-28 follow-up ("есть ли смысл сделать сейчас ещё раз self-audit контракту на
// mainnet?") and closed here instead of a full re-audit, since nothing else changed since the 25th.
//
// This links against `target/mainnet/pumpfantasy.so` (built with `--features mainnet`), not the
// `target/deploy/` one the other test files use — run `anchor build -- --features mainnet` and copy
// the result to `target/mainnet/pumpfantasy.so` before running this file if it's missing or stale
// (`cargo build -- --features mainnet` alone won't update it: `anchor build` also overwrites
// `target/deploy/`, so copy immediately after and rebuild the default target before other tests run).
use {
    anchor_lang::{prelude::Pubkey, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    anchor_lang::solana_program::instruction::Instruction,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    std::fs,
};

fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/mainnet/pumpfantasy.so"))
}

// The real production authority key (pubkey 27BDSBXfrhUBKXmWppS6VDfjPCMnm7LCEZZXcCmAVHNx = the
// PLATFORM_AUTHORITY constant under the mainnet feature) — read from the gitignored repo-root file at
// test-run time, same pattern as `attestation-signer.json` in the other test files.
fn load_platform_authority() -> Keypair {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../mainnet-authority.json");
    let json = fs::read_to_string(path).expect("mainnet-authority.json not found at repo root");
    let bytes: Vec<u8> = serde_json::from_str(&json).expect("invalid mainnet-authority.json");
    Keypair::new_from_array(bytes[..32].try_into().expect("keypair file too short"))
}

fn tournament_pda(program_id: &Pubkey, id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[pumpfantasy::TOURNAMENT_SEED, id.to_le_bytes().as_ref()], program_id)
}

fn vault_pda(program_id: &Pubkey, tournament: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[pumpfantasy::VAULT_SEED, tournament.as_ref()], program_id)
}

fn create_tournament_ix(program_id: Pubkey, id: u64, authority: Pubkey) -> Instruction {
    let (tournament, _) = tournament_pda(&program_id, id);
    let (vault, _) = vault_pda(&program_id, &tournament);
    Instruction::new_with_bytes(
        program_id,
        &pumpfantasy::instruction::CreateTournament {
            id,
            entry_fee_lamports: 1_000_000_000,
            start_ts: 100,
            end_ts: 200,
            entry_mode: pumpfantasy::EntryMode::Single,
            guaranteed_amount_lamports: 0,
            mint: Pubkey::default(),
        }
        .data(),
        pumpfantasy::accounts::CreateTournament {
            authority,
            tournament,
            vault,
            vault_token_account: vault,
            mint_account: anchor_lang::solana_program::system_program::ID,
            token_program: anchor_lang::solana_program::system_program::ID,
            associated_token_program: anchor_lang::solana_program::system_program::ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn new_svm(program_id: Pubkey) -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, program_bytes()).unwrap();
    svm
}

/// The mainnet build's whole point: a tournament's authority decides who wins it (set_prize,
/// finalize_tournament), so anyone but the platform key creating one could just pay themselves.
#[test]
fn test_random_authority_cannot_create_tournament_on_mainnet() {
    let program_id = pumpfantasy::ID;
    let mut svm = new_svm(program_id);
    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 10_000_000_000).unwrap();

    let ix = create_tournament_ix(program_id, 1, impostor.pubkey());
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&impostor.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();

    let err = svm.send_transaction(tx).expect_err("an impostor authority must not be able to create a tournament");
    let logs = err.meta.logs.join("\n");
    assert!(
        logs.contains("Unauthorized") || logs.contains("ConstraintRaw"),
        "expected an Unauthorized rejection, got:\n{logs}"
    );
}

/// The other half of the same check: the real platform key must still work, so the mainnet build
/// isn't accidentally locked out of creating its own tournaments.
#[test]
fn test_platform_authority_can_create_tournament_on_mainnet() {
    let program_id = pumpfantasy::ID;
    let mut svm = new_svm(program_id);
    let authority = load_platform_authority();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();

    let ix = create_tournament_ix(program_id, 2, authority.pubkey());
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&authority.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&authority]).unwrap();

    svm.send_transaction(tx).expect("the real platform authority must be able to create a tournament");
}
