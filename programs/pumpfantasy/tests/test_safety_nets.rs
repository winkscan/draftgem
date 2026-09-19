// Money must never get stuck in a tournament vault. Two real failure modes
// found while automating payouts (2026-09-19):
//   1. a one-entry tournament could never pay its winner (vault rent minimum)
//   2. one coin whose price can't be recorded locks every entrant's fee forever
use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::{AccountMeta, Instruction},
        InstructionData, ToAccountMetas,
    },
    ed25519_dalek::{Signer as DalekSigner, SigningKey},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    std::fs,
};

const PICKS_PER_ENTRY: usize = 5;

fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/pumpfantasy.so"))
}

// Same as test_tournament_flow.rs: the real attestation-signer key, read at
// test-run time from the gitignored repo-root file, never compiled in.
fn load_attestation_signer() -> SigningKey {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../attestation-signer.json");
    let json = fs::read_to_string(path).expect("attestation-signer.json not found at repo root");
    let bytes: Vec<u8> = serde_json::from_str(&json).expect("invalid attestation-signer.json");
    SigningKey::from_bytes(bytes[..32].try_into().unwrap())
}

fn attestation_message(picks: &[Pubkey; PICKS_PER_ENTRY], fp_costs: &[u32; PICKS_PER_ENTRY], expiry: i64) -> Vec<u8> {
    let mut msg = Vec::with_capacity(8 + PICKS_PER_ENTRY * 36);
    msg.extend_from_slice(&expiry.to_le_bytes());
    for i in 0..PICKS_PER_ENTRY {
        msg.extend_from_slice(picks[i].as_ref());
        msg.extend_from_slice(&fp_costs[i].to_le_bytes());
    }
    msg
}

fn build_ed25519_instruction(signer: &SigningKey, message: &[u8]) -> Instruction {
    let signature = signer.sign(message).to_bytes();
    let pubkey = signer.verifying_key().to_bytes();
    const SENTINEL: u16 = u16::MAX;
    let pubkey_offset: u16 = 16;
    let signature_offset: u16 = pubkey_offset + 32;
    let message_offset: u16 = signature_offset + 64;

    let mut data = Vec::with_capacity(16 + 32 + 64 + message.len());
    data.push(1u8);
    data.push(0u8);
    data.extend_from_slice(&signature_offset.to_le_bytes());
    data.extend_from_slice(&SENTINEL.to_le_bytes());
    data.extend_from_slice(&pubkey_offset.to_le_bytes());
    data.extend_from_slice(&SENTINEL.to_le_bytes());
    data.extend_from_slice(&message_offset.to_le_bytes());
    data.extend_from_slice(&(message.len() as u16).to_le_bytes());
    data.extend_from_slice(&SENTINEL.to_le_bytes());
    data.extend_from_slice(&pubkey);
    data.extend_from_slice(&signature);
    data.extend_from_slice(message);
    Instruction { program_id: solana_sdk_ids::ed25519_program::ID, accounts: vec![], data }
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: Vec<Instruction>) -> litesvm::types::TransactionResult {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx)
}

fn tournament_pda(program_id: &Pubkey, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[pumpfantasy::TOURNAMENT_SEED, id.to_le_bytes().as_ref()], program_id).0
}
fn vault_pda(program_id: &Pubkey, tournament: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[pumpfantasy::VAULT_SEED, tournament.as_ref()], program_id).0
}
fn asset_pda(program_id: &Pubkey, tournament: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[pumpfantasy::ASSET_SEED, tournament.as_ref(), mint.as_ref()], program_id).0
}
fn entry_pda(program_id: &Pubkey, tournament: &Pubkey, player: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[pumpfantasy::ENTRY_SEED, tournament.as_ref(), player.as_ref(), 0u16.to_le_bytes().as_ref()],
        program_id,
    )
    .0
}

struct Mini {
    svm: LiteSVM,
    program_id: Pubkey,
    authority: Keypair,
    tournament: Pubkey,
    vault: Pubkey,
    start_ts: i64,
    end_ts: i64,
    mints: Vec<Pubkey>,
    fee: u64,
}

fn mini_tournament(fee: u64) -> Mini {
    let program_id = pumpfantasy::ID;
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, program_bytes()).unwrap();
    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
    let now = svm.get_sysvar::<Clock>().unix_timestamp;
    let tournament = tournament_pda(&program_id, 7);
    let vault = vault_pda(&program_id, &tournament);
    let (start_ts, end_ts) = (now + 100, now + 200);
    let ix = Instruction::new_with_bytes(
        program_id,
        &pumpfantasy::instruction::CreateTournament {
            id: 7,
            entry_fee_lamports: fee,
            start_ts,
            end_ts,
            entry_mode: pumpfantasy::EntryMode::Single,
            guaranteed_amount_lamports: 0,
        }
        .data(),
        pumpfantasy::accounts::CreateTournament {
            authority: authority.pubkey(),
            tournament,
            vault,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut svm, &authority, vec![ix]).expect("create failed");
    let mints = (0..5).map(|_| Pubkey::new_unique()).collect();
    Mini { svm, program_id, authority, tournament, vault, start_ts, end_ts, mints, fee }
}

impl Mini {
    fn set_time(&mut self, ts: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = ts;
        self.svm.set_sysvar(&clock);
    }

    fn enter(&mut self, player: &Keypair) -> Pubkey {
        let signer = load_attestation_signer();
        let expiry = self.svm.get_sysvar::<Clock>().unix_timestamp + 60;
        let picks: [Pubkey; PICKS_PER_ENTRY] = std::array::from_fn(|i| self.mints[i]);
        let fp_costs = [100u32; PICKS_PER_ENTRY];
        let ed = build_ed25519_instruction(&signer, &attestation_message(&picks, &fp_costs, expiry));
        let entry = entry_pda(&self.program_id, &self.tournament, &player.pubkey());
        let metas = pumpfantasy::accounts::EnterTournament {
            player: player.pubkey(),
            tournament: self.tournament,
            vault: self.vault,
            entry,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None);
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::EnterTournament { entry_index: 0, picks, fp_costs, attestation_expiry: expiry }.data(),
            metas,
        );
        send(&mut self.svm, player, vec![ed, ix]).expect("entry failed");
        entry
    }

    fn register_and_resolve(&mut self, end_price: u64) {
        self.set_time(self.start_ts + 1);
        for mint in self.mints.clone() {
            let ix = Instruction::new_with_bytes(
                self.program_id,
                &pumpfantasy::instruction::RegisterAssetPrice { mint, start_price_micros: 1_000_000 }.data(),
                pumpfantasy::accounts::RegisterAssetPrice {
                    authority: self.authority.pubkey(),
                    tournament: self.tournament,
                    asset: asset_pda(&self.program_id, &self.tournament, &mint),
                    system_program: anchor_lang::solana_program::system_program::ID,
                }
                .to_account_metas(None),
            );
            send(&mut self.svm, &self.authority, vec![ix]).expect("register failed");
        }
        self.set_time(self.end_ts + 1);
        for mint in self.mints.clone() {
            let ix = Instruction::new_with_bytes(
                self.program_id,
                &pumpfantasy::instruction::SubmitResult { end_price_micros: end_price }.data(),
                pumpfantasy::accounts::SubmitResult {
                    authority: self.authority.pubkey(),
                    tournament: self.tournament,
                    asset: asset_pda(&self.program_id, &self.tournament, &mint),
                }
                .to_account_metas(None),
            );
            send(&mut self.svm, &self.authority, vec![ix]).expect("submit failed");
        }
    }

    fn claim_ix(&self, entry: Pubkey, player: Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::ClaimPrize {}.data(),
            pumpfantasy::accounts::ClaimPrize {
                cranker: self.authority.pubkey(),
                tournament: self.tournament,
                vault: self.vault,
                entry,
                player,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn refund_ix(&self, entry: Pubkey, player: Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::RefundEntry {}.data(),
            pumpfantasy::accounts::RefundEntry {
                cranker: self.authority.pubkey(),
                tournament: self.tournament,
                vault: self.vault,
                entry,
                player,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn cancel_ix(&self, signer: &Keypair) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::CancelTournament {}.data(),
            pumpfantasy::accounts::CancelTournament { authority: signer.pubkey(), tournament: self.tournament }
                .to_account_metas(None),
        )
    }
}

/// One entry: the 5% rake (500,000 lamports here) is below the vault's
/// rent-exempt minimum, so a plain 95% payout would leave an illegal sliver
/// and the winner's claim would fail forever. The claim must pay it all out.
#[test]
fn test_single_entry_can_claim_despite_vault_rent_minimum() {
    let mut t = mini_tournament(10_000_000); // 0.01 SOL
    let player = Keypair::new();
    t.svm.airdrop(&player.pubkey(), 1_000_000_000).unwrap();
    let entry = t.enter(&player);
    t.register_and_resolve(1_100_000); // +10% on every pick

    let mut metas = pumpfantasy::accounts::SettleEntry {
        cranker: t.authority.pubkey(),
        tournament: t.tournament,
        entry,
    }
    .to_account_metas(None);
    for mint in &t.mints {
        metas.push(AccountMeta::new_readonly(asset_pda(&t.program_id, &t.tournament, mint), false));
    }
    let settle = Instruction::new_with_bytes(t.program_id, &pumpfantasy::instruction::SettleEntry {}.data(), metas);
    send(&mut t.svm, &t.authority, vec![settle]).expect("settle failed");

    let finalize = Instruction::new_with_bytes(
        t.program_id,
        &pumpfantasy::instruction::FinalizeTournament { winners_count: 1, threshold_score_bps: 1000 }.data(),
        pumpfantasy::accounts::FinalizeTournament { authority: t.authority.pubkey(), tournament: t.tournament }
            .to_account_metas(None),
    );
    send(&mut t.svm, &t.authority, vec![finalize]).expect("finalize failed");

    let before = t.svm.get_balance(&player.pubkey()).unwrap();
    let claim = t.claim_ix(entry, player.pubkey());
    send(&mut t.svm, &t.authority, vec![claim]).expect("single-entry claim must succeed");

    let gained = t.svm.get_balance(&player.pubkey()).unwrap() - before;
    assert!(gained >= 9_500_000, "winner should receive at least the 95% share, got {gained}");
    assert_eq!(t.svm.get_balance(&t.vault).unwrap_or(0), 0, "vault should be fully drained, not stranded");
}

/// A coin's prices never get recorded, so entries can never be settled. After
/// the grace period the authority cancels and every entrant is refunded exactly
/// once; nothing else works on a cancelled tournament.
#[test]
fn test_cancel_and_refund_when_tournament_cannot_settle() {
    let mut t = mini_tournament(10_000_000);
    let (a, b) = (Keypair::new(), Keypair::new());
    for kp in [&a, &b] {
        t.svm.airdrop(&kp.pubkey(), 1_000_000_000).unwrap();
    }
    let entry_a = t.enter(&a);
    let entry_b = t.enter(&b);

    // Ended, but no prices were ever recorded. Too soon to cancel...
    t.set_time(t.end_ts + 1);
    let cancel = t.cancel_ix(&t.authority);
    assert!(send(&mut t.svm, &t.authority, vec![cancel]).is_err(), "cancel before the grace period must fail");
    // ...and refunds don't exist until it's cancelled.
    let early_refund = t.refund_ix(entry_a, a.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![early_refund]).is_err(), "refund before cancel must fail");

    t.set_time(t.end_ts + pumpfantasy::CANCEL_GRACE_SECONDS + 1);
    t.svm.expire_blockhash(); // otherwise the retried, byte-identical txs below are dropped as AlreadyProcessed
    let stranger = Keypair::new();
    t.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let forged = t.cancel_ix(&stranger);
    assert!(send(&mut t.svm, &stranger, vec![forged]).is_err(), "only the authority may cancel");
    let cancel = t.cancel_ix(&t.authority);
    send(&mut t.svm, &t.authority, vec![cancel]).expect("cancel after grace must succeed");

    let (bal_a, bal_b) = (t.svm.get_balance(&a.pubkey()).unwrap(), t.svm.get_balance(&b.pubkey()).unwrap());
    let refund_a = t.refund_ix(entry_a, a.pubkey());
    send(&mut t.svm, &t.authority, vec![refund_a]).expect("refund A");
    let refund_b = t.refund_ix(entry_b, b.pubkey());
    send(&mut t.svm, &t.authority, vec![refund_b]).expect("refund B");
    assert_eq!(t.svm.get_balance(&a.pubkey()).unwrap() - bal_a, t.fee, "A gets exactly the fee back");
    assert_eq!(t.svm.get_balance(&b.pubkey()).unwrap() - bal_b, t.fee, "B gets exactly the fee back");
    assert_eq!(t.svm.get_balance(&t.vault).unwrap_or(0), 0, "vault fully returned");

    // Not twice, and a cancelled tournament pays no prizes.
    t.svm.expire_blockhash();
    let again = t.refund_ix(entry_a, a.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![again]).is_err(), "double refund must fail");
    let claim = t.claim_ix(entry_a, a.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![claim]).is_err(), "no prize on a cancelled tournament");
}
