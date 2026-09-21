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
fn entry_pda(program_id: &Pubkey, tournament: &Pubkey, player: &Pubkey, index: u16) -> Pubkey {
    Pubkey::find_program_address(
        &[pumpfantasy::ENTRY_SEED, tournament.as_ref(), player.as_ref(), index.to_le_bytes().as_ref()],
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
    mini_tournament_with(fee, pumpfantasy::EntryMode::Single)
}

fn mini_tournament_with(fee: u64, entry_mode: pumpfantasy::EntryMode) -> Mini {
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
            entry_mode,
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
        self.enter_at(player, 0)
    }

    fn enter_at(&mut self, player: &Keypair, entry_index: u16) -> Pubkey {
        let signer = load_attestation_signer();
        let expiry = self.svm.get_sysvar::<Clock>().unix_timestamp + 60;
        let picks: [Pubkey; PICKS_PER_ENTRY] = std::array::from_fn(|i| self.mints[i]);
        let fp_costs = [100u32; PICKS_PER_ENTRY];
        let ed = build_ed25519_instruction(&signer, &attestation_message(&picks, &fp_costs, expiry));
        let entry = entry_pda(&self.program_id, &self.tournament, &player.pubkey(), entry_index);
        let mut metas = pumpfantasy::accounts::EnterTournament {
            player: player.pubkey(),
            tournament: self.tournament,
            vault: self.vault,
            entry,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None);
        // The picked coins' price accounts (the first picker creates them and pays the rent).
        for mint in &picks {
            metas.push(AccountMeta::new(asset_pda(&self.program_id, &self.tournament, mint), false));
        }
        let ix = Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::EnterTournament { entry_index, picks, fp_costs, attestation_expiry: expiry }.data(),
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
/// and the winner's claim would fail forever. The claim must instead pay out
/// what leaves the vault at exactly the rent minimum, so the house keeps its
/// rake and the winner is not blocked.
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
        &pumpfantasy::instruction::FinalizeTournament { winners_count: 1, threshold_score_bps: 1000, fee_bps: pumpfantasy::RAKE_BPS }.data(),
        pumpfantasy::accounts::FinalizeTournament { authority: t.authority.pubkey(), tournament: t.tournament }
            .to_account_metas(None),
    );
    send(&mut t.svm, &t.authority, vec![finalize]).expect("finalize failed");

    let before = t.svm.get_balance(&player.pubkey()).unwrap();
    let claim = t.claim_ix(entry, player.pubkey());
    send(&mut t.svm, &t.authority, vec![claim]).expect("single-entry claim must succeed");

    let rent_minimum = t.svm.minimum_balance_for_rent_exemption(0);
    let gained = t.svm.get_balance(&player.pubkey()).unwrap() - before;
    assert!(gained > 9_000_000, "winner should receive nearly the whole pool, got {gained}");
    assert_eq!(
        t.svm.get_balance(&t.vault).unwrap_or(0),
        rent_minimum,
        "the house keeps the vault at the rent-exempt minimum, nothing stranded below it"
    );
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
    // The fee comes back AND the entry account's rent (the entry is closed).
    assert!(t.svm.get_balance(&a.pubkey()).unwrap() - bal_a > t.fee, "A gets the fee plus the entry's rent back");
    assert!(t.svm.get_balance(&b.pubkey()).unwrap() - bal_b > t.fee, "B gets the fee plus the entry's rent back");
    assert_eq!(t.svm.get_balance(&t.vault).unwrap_or(0), 0, "vault fully returned");
    assert!(t.svm.get_account(&entry_a).is_none_or(|acc| acc.lamports == 0), "entry account is closed");

    // Not twice, and a cancelled tournament pays no prizes.
    t.svm.expire_blockhash();
    let again = t.refund_ix(entry_a, a.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![again]).is_err(), "double refund must fail");
    let claim = t.claim_ix(entry_a, a.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![claim]).is_err(), "no prize on a cancelled tournament");
}

// ---------------------------------------------------------------------------
// Fees: the platform rake and the creator cut of player-made tournaments.
// ---------------------------------------------------------------------------

impl Mini {
    fn settle_ix(&self, entry: Pubkey) -> Instruction {
        let mut metas = pumpfantasy::accounts::SettleEntry {
            cranker: self.authority.pubkey(),
            tournament: self.tournament,
            entry,
        }
        .to_account_metas(None);
        for mint in &self.mints {
            metas.push(AccountMeta::new_readonly(asset_pda(&self.program_id, &self.tournament, mint), false));
        }
        Instruction::new_with_bytes(self.program_id, &pumpfantasy::instruction::SettleEntry {}.data(), metas)
    }

    fn finalize_ix(&self, winners_count: u32, threshold_score_bps: i32, fee_bps: u16) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::FinalizeTournament { winners_count, threshold_score_bps, fee_bps }.data(),
            pumpfantasy::accounts::FinalizeTournament { authority: self.authority.pubkey(), tournament: self.tournament }
                .to_account_metas(None),
        )
    }

    fn withdraw_fees_ix(&self, signer: &Keypair, creator: Pubkey, creator_lamports: u64) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::WithdrawFees { creator_lamports }.data(),
            pumpfantasy::accounts::WithdrawFees {
                authority: signer.pubkey(),
                tournament: self.tournament,
                vault: self.vault,
                creator,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Two players enter the same portfolio (so they tie and both win), prices resolve,
    /// both are settled and the tournament is finalized with `fee_bps`.
    fn two_tied_winners(&mut self, fee_bps: u16) -> ((Keypair, Pubkey), (Keypair, Pubkey)) {
        let (a, b) = (Keypair::new(), Keypair::new());
        for kp in [&a, &b] {
            self.svm.airdrop(&kp.pubkey(), 1_000_000_000).unwrap();
        }
        let entry_a = self.enter(&a);
        let entry_b = self.enter(&b);
        self.register_and_resolve(1_100_000);
        for entry in [entry_a, entry_b] {
            let ix = self.settle_ix(entry);
            send(&mut self.svm, &self.authority, vec![ix]).expect("settle failed");
        }
        let ix = self.finalize_ix(2, 1000, fee_bps);
        send(&mut self.svm, &self.authority, vec![ix]).expect("finalize failed");
        ((a, entry_a), (b, entry_b))
    }
}

/// A player-made tournament: finalized at rake + creator cut (10%), winners get
/// 90%, and withdraw_fees pays the creator exactly 5% and the platform the rest of
/// the fees, while leaving the vault able to pay every winner in full.
#[test]
fn test_creator_tournament_splits_pool_90_5_5() {
    let mut t = mini_tournament(100_000_000); // 0.1 SOL each, pool 0.2 SOL
    let ((a, entry_a), (b, entry_b)) = t.two_tied_winners(pumpfantasy::RAKE_BPS + pumpfantasy::CREATOR_FEE_BPS);
    let creator = Keypair::new();
    let rent_minimum = t.svm.minimum_balance_for_rent_exemption(0);

    // Winners' pot is 90% of 0.2 SOL.
    let (bal_a, bal_b) = (t.svm.get_balance(&a.pubkey()).unwrap(), t.svm.get_balance(&b.pubkey()).unwrap());
    let claim_a = t.claim_ix(entry_a, a.pubkey());
    send(&mut t.svm, &t.authority, vec![claim_a]).expect("claim A");
    assert_eq!(t.svm.get_balance(&a.pubkey()).unwrap() - bal_a, 90_000_000, "each winner gets half of 90%");

    // Fees: creator 5% of the pool = 10,000,000; platform gets the other fees minus the vault's rent reserve.
    let auth_before = t.svm.get_balance(&t.authority.pubkey()).unwrap();
    let withdraw = t.withdraw_fees_ix(&t.authority, creator.pubkey(), 10_000_000);
    send(&mut t.svm, &t.authority, vec![withdraw]).expect("withdraw_fees");
    assert_eq!(t.svm.get_balance(&creator.pubkey()).unwrap(), 10_000_000, "creator gets exactly 5% of the pool");
    let platform_gain = t.svm.get_balance(&t.authority.pubkey()).unwrap() + 5_000 - auth_before; // + the tx fee
    assert_eq!(platform_gain, 20_000_000 - 10_000_000 - rent_minimum, "platform gets the rest of the fees, minus the reserve");

    // B can still claim in full after the fees left, and the vault ends at exactly the rent minimum.
    let claim_b = t.claim_ix(entry_b, b.pubkey());
    send(&mut t.svm, &t.authority, vec![claim_b]).expect("claim B after withdraw");
    assert_eq!(t.svm.get_balance(&b.pubkey()).unwrap() - bal_b, 90_000_000, "B is paid in full despite the withdrawal");
    assert_eq!(t.svm.get_balance(&t.vault).unwrap_or(0), rent_minimum, "only the rent reserve is left");

    // Nothing more to take, ever.
    t.svm.expire_blockhash();
    let again = t.withdraw_fees_ix(&t.authority, creator.pubkey(), 0);
    assert!(send(&mut t.svm, &t.authority, vec![again]).is_err(), "a second withdrawal finds nothing");
}

/// Guard rails: the creator can't be overpaid, an ordinary tournament has no creator cut,
/// only the authority may withdraw, only after finalizing, and only two fee levels exist.
#[test]
fn test_withdraw_fees_guard_rails() {
    let creator = Keypair::new();

    // Ordinary (5%) tournament: no creator cut at all, the platform takes the whole rake.
    let mut t = mini_tournament(100_000_000);
    let early = t.withdraw_fees_ix(&t.authority, creator.pubkey(), 0);
    assert!(send(&mut t.svm, &t.authority, vec![early]).is_err(), "nothing to withdraw before finalizing");
    let _ = t.two_tied_winners(pumpfantasy::RAKE_BPS);
    t.svm.expire_blockhash();
    let overpay = t.withdraw_fees_ix(&t.authority, creator.pubkey(), 1);
    assert!(send(&mut t.svm, &t.authority, vec![overpay]).is_err(), "no creator cut on a 5% tournament");
    let stranger = Keypair::new();
    t.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let forged = t.withdraw_fees_ix(&stranger, creator.pubkey(), 0);
    assert!(send(&mut t.svm, &stranger, vec![forged]).is_err(), "only the authority may withdraw");
    let rent_minimum = t.svm.minimum_balance_for_rent_exemption(0);
    let before = t.svm.get_balance(&t.authority.pubkey()).unwrap();
    let ok = t.withdraw_fees_ix(&t.authority, creator.pubkey(), 0);
    send(&mut t.svm, &t.authority, vec![ok]).expect("platform withdrawal");
    assert_eq!(
        t.svm.get_balance(&t.authority.pubkey()).unwrap() + 5_000 - before,
        10_000_000 - rent_minimum,
        "the whole 5% rake, minus the reserve"
    );

    // Player-made tournament: the creator can't take more than their 5%.
    let mut t2 = mini_tournament(100_000_000);
    let _ = t2.two_tied_winners(pumpfantasy::RAKE_BPS + pumpfantasy::CREATOR_FEE_BPS);
    t2.svm.expire_blockhash();
    let greedy = t2.withdraw_fees_ix(&t2.authority, creator.pubkey(), 10_000_001);
    assert!(send(&mut t2.svm, &t2.authority, vec![greedy]).is_err(), "creator share above 5% must fail");

    // Only the two legal fee levels can be used to finalize.
    let mut t3 = mini_tournament(100_000_000);
    let (a, b) = (Keypair::new(), Keypair::new());
    for kp in [&a, &b] {
        t3.svm.airdrop(&kp.pubkey(), 1_000_000_000).unwrap();
    }
    let (ea, eb) = (t3.enter(&a), t3.enter(&b));
    t3.register_and_resolve(1_100_000);
    for e in [ea, eb] {
        let ix = t3.settle_ix(e);
        send(&mut t3.svm, &t3.authority, vec![ix]).unwrap();
    }
    let bad = t3.finalize_ix(2, 1000, 2_000);
    assert!(send(&mut t3.svm, &t3.authority, vec![bad]).is_err(), "a 20% fee must be rejected");
    t3.svm.expire_blockhash();
    let bad_low = t3.finalize_ix(2, 1000, 0);
    assert!(send(&mut t3.svm, &t3.authority, vec![bad_low]).is_err(), "a 0% fee must be rejected");
}

// ---------------------------------------------------------------------------
// Rent: nothing is fronted by the platform for good, and players get theirs back.
// ---------------------------------------------------------------------------

impl Mini {
    fn close_entry_ix(&self, entry: Pubkey, player: Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::CloseEntry {}.data(),
            pumpfantasy::accounts::CloseEntry {
                cranker: self.authority.pubkey(),
                tournament: self.tournament,
                entry,
                player,
            }
            .to_account_metas(None),
        )
    }

    fn close_asset_ix(&self, mint: &Pubkey, payer: Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::CloseAssetPrice {}.data(),
            pumpfantasy::accounts::CloseAssetPrice {
                cranker: self.authority.pubkey(),
                tournament: self.tournament,
                asset: asset_pda(&self.program_id, &self.tournament, mint),
                payer,
            }
            .to_account_metas(None),
        )
    }

    fn close_tournament_ix(&self) -> Instruction {
        Instruction::new_with_bytes(
            self.program_id,
            &pumpfantasy::instruction::CloseTournament {}.data(),
            pumpfantasy::accounts::CloseTournament {
                authority: self.authority.pubkey(),
                tournament: self.tournament,
                vault: self.vault,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn gone(&self, key: &Pubkey) -> bool {
        self.svm.get_account(key).is_none_or(|a| a.lamports == 0)
    }
}

/// The whole life of a tournament, following the money: the first player to pick a coin pays that
/// coin's account rent (a second picker of the same coin pays none), and every piece of rent goes
/// back — entries and coins to the players, the tournament account and the vault leftover to us.
#[test]
fn test_rent_is_paid_by_players_and_fully_returned() {
    let mut t = mini_tournament(100_000_000);
    let (a, b) = (Keypair::new(), Keypair::new());
    for kp in [&a, &b] {
        t.svm.airdrop(&kp.pubkey(), 1_000_000_000).unwrap();
    }
    let asset_rent = t.svm.minimum_balance_for_rent_exemption(8 + 32 + 32 + 8 + 8 + 1 + 1 + 32);
    let entry_rent = t.svm.minimum_balance_for_rent_exemption(8 + 32 + 32 + 2 + 32 * 5 + 4 + 4 + 1 + 1 + 8 + 1);
    let auth_before_entries = t.svm.get_balance(&t.authority.pubkey()).unwrap();

    // A picks five coins nobody has picked; B picks the same five.
    let (a0, b0) = (t.svm.get_balance(&a.pubkey()).unwrap(), t.svm.get_balance(&b.pubkey()).unwrap());
    let entry_a = t.enter(&a);
    let entry_b = t.enter(&b);
    let a_spent = a0 - t.svm.get_balance(&a.pubkey()).unwrap();
    let b_spent = b0 - t.svm.get_balance(&b.pubkey()).unwrap();
    assert_eq!(a_spent - b_spent, 5 * asset_rent, "only the first picker pays the coins' rent");
    assert_eq!(
        t.svm.get_balance(&t.authority.pubkey()).unwrap(),
        auth_before_entries,
        "the platform pays nothing for the coins"
    );

    t.register_and_resolve(1_100_000);
    for e in [entry_a, entry_b] {
        let ix = t.settle_ix(e);
        send(&mut t.svm, &t.authority, vec![ix]).expect("settle");
    }
    let ix = t.finalize_ix(2, 1000, pumpfantasy::RAKE_BPS);
    send(&mut t.svm, &t.authority, vec![ix]).expect("finalize");

    // Too early to tidy up while prizes are unclaimed / fees not withdrawn.
    let early = t.close_entry_ix(entry_a, a.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![early]).is_err(), "a winner's entry can't close before the claim");
    t.svm.expire_blockhash();
    let early_tournament = t.close_tournament_ix();
    assert!(send(&mut t.svm, &t.authority, vec![early_tournament]).is_err(), "not while entries and coins are open");

    for (e, kp) in [(entry_a, &a), (entry_b, &b)] {
        let ix = t.claim_ix(e, kp.pubkey());
        send(&mut t.svm, &t.authority, vec![ix]).expect("claim");
    }
    let ix = t.withdraw_fees_ix(&t.authority, t.authority.pubkey(), 0);
    send(&mut t.svm, &t.authority, vec![ix]).expect("withdraw fees");

    // Entries: each player gets exactly their entry rent back.
    for (e, kp) in [(entry_a, &a), (entry_b, &b)] {
        let before = t.svm.get_balance(&kp.pubkey()).unwrap();
        let ix = t.close_entry_ix(e, kp.pubkey());
        send(&mut t.svm, &t.authority, vec![ix]).expect("close entry");
        assert_eq!(t.svm.get_balance(&kp.pubkey()).unwrap() - before, entry_rent, "entry rent returned");
        assert!(t.gone(&e), "entry account is closed");
    }

    // Coins: the first picker (A) gets all five back, B gets nothing (B paid nothing).
    let mints = t.mints.clone();
    let (a1, b1) = (t.svm.get_balance(&a.pubkey()).unwrap(), t.svm.get_balance(&b.pubkey()).unwrap());
    for mint in &mints {
        let ix = t.close_asset_ix(mint, a.pubkey());
        send(&mut t.svm, &t.authority, vec![ix]).expect("close asset");
    }
    assert_eq!(t.svm.get_balance(&a.pubkey()).unwrap() - a1, 5 * asset_rent, "the payer gets the coins' rent back");
    assert_eq!(t.svm.get_balance(&b.pubkey()).unwrap(), b1, "the second picker gets nothing extra (paid nothing)");
    let wrong_payer = t.close_asset_ix(&mints[0], b.pubkey());
    t.svm.expire_blockhash();
    assert!(send(&mut t.svm, &t.authority, vec![wrong_payer]).is_err(), "already closed, and never to the wrong wallet");

    // The tournament itself: our rent (and the vault's leftover) comes home.
    let tournament_rent = t.svm.minimum_balance_for_rent_exemption(8 + 32 + 8 + 8 + 8 + 8 + 2 + 4 + 4 + 8 + 1 + 4 + 4 + 8 + 1 + 8 + 1 + 1);
    let auth_before_close = t.svm.get_balance(&t.authority.pubkey()).unwrap();
    let ix = t.close_tournament_ix();
    send(&mut t.svm, &t.authority, vec![ix]).expect("close tournament");
    let gained = t.svm.get_balance(&t.authority.pubkey()).unwrap() + 10_000 - auth_before_close; // + tx fee allowance
    assert!(gained >= tournament_rent, "the tournament's rent is returned, got {gained} < {tournament_rent}");
    assert!(t.gone(&t.tournament), "tournament account is closed");
    assert_eq!(t.svm.get_balance(&t.vault).unwrap_or(0), 0, "the vault is emptied too");
}

/// Closing is only allowed when nothing can be lost by it.
#[test]
fn test_close_tournament_guards() {
    // A tournament nobody entered can be closed once its entry window is over — not before.
    let mut empty = mini_tournament(10_000_000);
    let early = empty.close_tournament_ix();
    assert!(send(&mut empty.svm, &empty.authority, vec![early]).is_err(), "not before entries lock");
    empty.set_time(empty.start_ts + 1);
    empty.svm.expire_blockhash();
    let stranger = Keypair::new();
    empty.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let mut forged = empty.close_tournament_ix();
    forged.accounts[0].pubkey = stranger.pubkey();
    assert!(send(&mut empty.svm, &stranger, vec![forged]).is_err(), "only the authority may close");
    let ok = empty.close_tournament_ix();
    send(&mut empty.svm, &empty.authority, vec![ok]).expect("an empty tournament can be closed");
    assert!(empty.gone(&empty.tournament));

    // One that has an entry can't be closed while open, even after it started.
    let mut t = mini_tournament(10_000_000);
    let p = Keypair::new();
    t.svm.airdrop(&p.pubkey(), 1_000_000_000).unwrap();
    let entry = t.enter(&p);
    t.set_time(t.start_ts + 1);
    let nope = t.close_tournament_ix();
    assert!(send(&mut t.svm, &t.authority, vec![nope]).is_err(), "not while it has entries");

    // A cancelled tournament winds down through refunds, then coins, then the tournament.
    t.set_time(t.end_ts + pumpfantasy::CANCEL_GRACE_SECONDS + 1);
    let cancel = t.cancel_ix(&t.authority);
    send(&mut t.svm, &t.authority, vec![cancel]).expect("cancel");
    let early_asset = t.close_asset_ix(&t.mints[0].clone(), p.pubkey());
    assert!(send(&mut t.svm, &t.authority, vec![early_asset]).is_ok(), "coins may be closed once cancelled");
    let refund = t.refund_ix(entry, p.pubkey());
    send(&mut t.svm, &t.authority, vec![refund]).expect("refund");
    for mint in t.mints.clone().iter().skip(1) {
        let ix = t.close_asset_ix(mint, p.pubkey());
        send(&mut t.svm, &t.authority, vec![ix]).expect("close asset");
    }
    t.svm.expire_blockhash(); // the earlier failed attempt was byte-identical
    let last = t.close_tournament_ix();
    send(&mut t.svm, &t.authority, vec![last]).expect("a fully wound-down cancelled tournament closes");
    assert!(t.gone(&t.tournament));
}
