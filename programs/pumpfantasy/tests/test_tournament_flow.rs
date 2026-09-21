use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::{AccountMeta, Instruction},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    ed25519_dalek::{Signer as DalekSigner, SigningKey},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    std::fs,
};

fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/pumpfantasy.so"))
}

// Reads the real attestation-signer keypair from the repo root (gitignored,
// never embedded in any compiled artifact — loaded fresh at test-run time)
// so a successful attestation actually matches ATTESTATION_SIGNER in
// constants.rs. Any dev machine missing this file simply can't run this
// test's success paths — expected, it's the same file the Worker uses.
fn load_attestation_signer() -> SigningKey {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../attestation-signer.json");
    let json = fs::read_to_string(path).expect("attestation-signer.json not found at repo root");
    let bytes: Vec<u8> = serde_json::from_str(&json).expect("invalid attestation-signer.json");
    SigningKey::from_bytes(bytes[..32].try_into().unwrap())
}

const PICKS_PER_ENTRY: usize = 5;

fn attestation_message(picks: &[Pubkey; PICKS_PER_ENTRY], fp_costs: &[u32; PICKS_PER_ENTRY], expiry: i64) -> Vec<u8> {
    let mut msg = Vec::with_capacity(8 + PICKS_PER_ENTRY * 36);
    msg.extend_from_slice(&expiry.to_le_bytes());
    for i in 0..PICKS_PER_ENTRY {
        msg.extend_from_slice(picks[i].as_ref());
        msg.extend_from_slice(&fp_costs[i].to_le_bytes());
    }
    msg
}

// Hand-builds a native Ed25519Program instruction with the signature,
// pubkey, and message all self-contained in this one instruction's data —
// the same layout @solana/web3.js's Ed25519Program helper (and the Worker,
// in production) produces, and the exact layout enter_tournament.rs's
// verify_attestation reads.
fn build_ed25519_instruction(signer: &SigningKey, message: &[u8]) -> Instruction {
    let signature = signer.sign(message).to_bytes();
    let pubkey = signer.verifying_key().to_bytes();

    const SENTINEL: u16 = u16::MAX; // "current instruction" per the ed25519_program convention
    let pubkey_offset: u16 = 16;
    let signature_offset: u16 = pubkey_offset + 32;
    let message_offset: u16 = signature_offset + 64;

    let mut data = Vec::with_capacity(16 + 32 + 64 + message.len());
    data.push(1u8); // num_signatures
    data.push(0u8); // padding
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

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ixs: Vec<Instruction>,
    extra_signers: &[&Keypair],
) -> litesvm::types::TransactionResult {
    let blockhash = svm.latest_blockhash();
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
    svm.send_transaction(tx)
}

fn tournament_pda(program_id: &Pubkey, id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[pumpfantasy::TOURNAMENT_SEED, id.to_le_bytes().as_ref()],
        program_id,
    )
}

fn vault_pda(program_id: &Pubkey, tournament: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[pumpfantasy::VAULT_SEED, tournament.as_ref()], program_id)
}

fn asset_pda(program_id: &Pubkey, tournament: &Pubkey, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[pumpfantasy::ASSET_SEED, tournament.as_ref(), mint.as_ref()],
        program_id,
    )
}

fn entry_pda(program_id: &Pubkey, tournament: &Pubkey, player: &Pubkey, entry_index: u16) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            pumpfantasy::ENTRY_SEED,
            tournament.as_ref(),
            player.as_ref(),
            entry_index.to_le_bytes().as_ref(),
        ],
        program_id,
    )
}

struct Asset {
    mint: Pubkey,
    pda: Pubkey,
    fp_cost: u32,
    start_price: u64,
    end_price: u64,
}

/// Full lifecycle under the attestation-based design: create a tournament,
/// two players draft different 5-coin portfolios (attested fp_cost, no
/// pre-registered on-chain asset needed to pick a coin), a third player's
/// attested budget is deliberately over 4,000 and is rejected, entries
/// close, START prices are registered once per uniquely-picked mint
/// (shared by whoever picked it, regardless of when during the window they
/// entered), end prices are submitted, both entries are settled (a rug
/// floors at -100%, not worse), the tournament is finalized as a top-half
/// (50/50) format, and only the higher-scoring player can claim.
#[test]
fn test_full_tournament_flow() {
    let program_id = pumpfantasy::ID;
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, program_bytes()).unwrap();
    let signer = load_attestation_signer();

    let authority = Keypair::new();
    let player_a = Keypair::new();
    let player_b = Keypair::new();
    let player_c = Keypair::new();
    for kp in [&authority, &player_a, &player_b, &player_c] {
        svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    }

    let start_clock = svm.get_sysvar::<Clock>();
    let now = start_clock.unix_timestamp;

    let tournament_id: u64 = 1;
    let entry_fee_lamports: u64 = 1_000_000_000; // 1 SOL
    let start_ts = now + 100;
    let end_ts = now + 200;

    let (tournament, _) = tournament_pda(&program_id, tournament_id);
    let (vault, _) = vault_pda(&program_id, &tournament);

    let ix = Instruction::new_with_bytes(
        program_id,
        &pumpfantasy::instruction::CreateTournament {
            id: tournament_id,
            entry_fee_lamports,
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
    send(&mut svm, &authority, vec![ix], &[]).expect("create_tournament failed");

    // --- Candidate coins: fp_cost roughly inverse to "coin age" ----------
    let mut assets = vec![
        ("A1_SOL_like", 100u32, 20_000_000u64, 21_000_000u64), // +5%
        ("A2", 200, 5_000_000, 5_500_000),                     // +10%
        ("A3", 400, 1_000_000, 1_200_000),                     // +20%
        ("A4", 600, 500_000, 400_000),                         // -20%
        ("A5_rug", 1500, 100_000, 0),                          // -100% (dies)
        ("A6_moon", 1200, 2_000_000, 3_000_000),                // +50%
        ("A7", 800, 800_000, 880_000),                          // +10%
    ]
    .into_iter()
    .map(|(_, fp_cost, start_price, end_price)| {
        let mint = Pubkey::new_unique();
        let (pda, _) = asset_pda(&program_id, &tournament, &mint);
        Asset { mint, pda, fp_cost, start_price, end_price }
    })
    .collect::<Vec<_>>();

    let attestation_expiry = now + 60;

    let enter = |svm: &mut LiteSVM, player: &Keypair, entry_index: u16, pick_idxs: &[usize]| -> litesvm::types::TransactionResult {
        let (entry, _) = entry_pda(&program_id, &tournament, &player.pubkey(), entry_index);
        let picks: [Pubkey; PICKS_PER_ENTRY] = std::array::from_fn(|i| assets[pick_idxs[i]].mint);
        let fp_costs: [u32; PICKS_PER_ENTRY] = std::array::from_fn(|i| assets[pick_idxs[i]].fp_cost);
        let message = attestation_message(&picks, &fp_costs, attestation_expiry);
        let ed25519_ix = build_ed25519_instruction(&signer, &message);

        let mut metas = pumpfantasy::accounts::EnterTournament {
            player: player.pubkey(),
            tournament,
            vault,
            entry,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None);
        // The picked coins' price accounts: the first entry to pick a coin creates it and pays its rent.
        for mint in &picks {
            metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(
                asset_pda(&program_id, &tournament, mint).0,
                false,
            ));
        }
        let enter_ix = Instruction::new_with_bytes(
            program_id,
            &pumpfantasy::instruction::EnterTournament { entry_index, picks, fp_costs, attestation_expiry }.data(),
            metas,
        );
        send(svm, player, vec![ed25519_ix, enter_ix], &[])
    };

    // Player A: aggressive draft — takes the rug AND the moonshot.
    let picks_a = [4usize, 5, 3, 2, 0]; // A5_rug, A6_moon, A4, A3, A1
    let fp_a: u32 = picks_a.iter().map(|&i| assets[i].fp_cost).sum();
    assert!(fp_a <= pumpfantasy::MAX_BUDGET_FP, "player A over budget in test setup");
    enter(&mut svm, &player_a, 0, &picks_a).expect("player A entry failed");

    // Player B: safer draft — same moonshot, skips the rug.
    let picks_b = [0usize, 1, 2, 6, 5]; // A1, A2, A3, A7, A6_moon
    let fp_b: u32 = picks_b.iter().map(|&i| assets[i].fp_cost).sum();
    assert!(fp_b <= pumpfantasy::MAX_BUDGET_FP, "player B over budget in test setup");
    enter(&mut svm, &player_b, 0, &picks_b).expect("player B entry failed");

    // Player C tries to overspend the FP budget and must be rejected — the
    // attestation itself would have to lie about fp_cost to let this
    // through, and a real attestation server would simply refuse to sign
    // an over-budget request; here we just skip requesting one and confirm
    // the on-chain sum check alone rejects it (no attestation offered).
    let picks_c = [4usize, 5, 3, 2, 6]; // 1500+1200+600+400+800 = 4500 > 4000
    let fp_c: u32 = picks_c.iter().map(|&i| assets[i].fp_cost).sum();
    assert!(fp_c > pumpfantasy::MAX_BUDGET_FP, "player C should be over budget in test setup");
    let res = enter(&mut svm, &player_c, 0, &picks_c);
    assert!(res.is_err(), "overspent entry should have been rejected");

    // Single-mode enforcement: player A tries a second entry (index 1) in
    // this Single-mode tournament and must be rejected, even with a
    // perfectly valid budget/picks.
    let res_second = enter(&mut svm, &player_a, 1, &picks_b);
    assert!(res_second.is_err(), "a second entry in a Single-mode tournament should be rejected");

    // --- Entries close (start_ts), register the shared start prices ------
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = start_ts + 1;
    svm.set_sysvar(&clock);

    for asset in &assets {
        let ix = Instruction::new_with_bytes(
            program_id,
            &pumpfantasy::instruction::RegisterAssetPrice { mint: asset.mint, start_price_micros: asset.start_price }
                .data(),
            pumpfantasy::accounts::RegisterAssetPrice {
                authority: authority.pubkey(),
                tournament,
                asset: asset.pda,
            }
            .to_account_metas(None),
        );
        send(&mut svm, &authority, vec![ix], &[]).expect("register_asset_price failed");
    }

    // --- Fast-forward past tournament end, submit real end results -------
    clock.unix_timestamp = end_ts + 1;
    svm.set_sysvar(&clock);

    for asset in &mut assets {
        let ix = Instruction::new_with_bytes(
            program_id,
            &pumpfantasy::instruction::SubmitResult { end_price_micros: asset.end_price }.data(),
            pumpfantasy::accounts::SubmitResult {
                authority: authority.pubkey(),
                tournament,
                asset: asset.pda,
            }
            .to_account_metas(None),
        );
        send(&mut svm, &authority, vec![ix], &[]).expect("submit_result failed");
    }

    let settle = |svm: &mut LiteSVM, player: &Keypair, pick_idxs: &[usize]| {
        let (entry, _) = entry_pda(&program_id, &tournament, &player.pubkey(), 0);
        let mut metas = pumpfantasy::accounts::SettleEntry {
            cranker: authority.pubkey(),
            tournament,
            entry,
        }
        .to_account_metas(None);
        for &i in pick_idxs {
            metas.push(AccountMeta::new_readonly(assets[i].pda, false));
        }
        let ix = Instruction::new_with_bytes(program_id, &pumpfantasy::instruction::SettleEntry {}.data(), metas);
        send(svm, &authority, vec![ix], &[]).expect("settle_entry failed");
        entry
    };

    let entry_a = settle(&mut svm, &player_a, &picks_a);
    let entry_b = settle(&mut svm, &player_b, &picks_b);

    let load_entry = |svm: &LiteSVM, addr: &Pubkey| -> pumpfantasy::Entry {
        let acc = svm.get_account(addr).unwrap();
        pumpfantasy::Entry::try_deserialize(&mut acc.data.as_slice()).unwrap()
    };

    let state_a = load_entry(&svm, &entry_a);
    let state_b = load_entry(&svm, &entry_b);

    // Hand-computed: A5 floored at exactly -10000 bps (rug), average of
    // [-10000, +5000, -2000, +2000, +500] = -900 bps.
    assert_eq!(state_a.score_bps, -900, "player A score mismatch (rug should floor at -100%, not worse)");
    // B: average of [+500, +1000, +2000, +1000, +5000] = +1900 bps.
    assert_eq!(state_b.score_bps, 1900, "player B score mismatch");
    assert!(state_b.score_bps > state_a.score_bps, "safer draft should beat the rug-laden one");

    // --- Finalize as a 50/50-style single-winner-threshold round ---------
    let winners_count: u32 = 1;
    let threshold_score_bps: i32 = state_b.score_bps; // only B clears it
    let ix = Instruction::new_with_bytes(
        program_id,
        &pumpfantasy::instruction::FinalizeTournament { winners_count, threshold_score_bps, fee_bps: pumpfantasy::RAKE_BPS }.data(),
        pumpfantasy::accounts::FinalizeTournament { authority: authority.pubkey(), tournament }
            .to_account_metas(None),
    );
    send(&mut svm, &authority, vec![ix], &[]).expect("finalize_tournament failed");

    let expected_pool = entry_fee_lamports * 2; // A and B both paid in (C was rejected)
    let expected_distributed = expected_pool * (10_000 - pumpfantasy::RAKE_BPS as u64) / 10_000;
    assert_eq!(expected_distributed, 1_900_000_000);

    let balance_before = svm.get_balance(&player_b.pubkey()).unwrap();

    let claim = |svm: &mut LiteSVM, entry: &Pubkey, player: &Pubkey| {
        let ix = Instruction::new_with_bytes(
            program_id,
            &pumpfantasy::instruction::ClaimPrize {}.data(),
            pumpfantasy::accounts::ClaimPrize {
                cranker: authority.pubkey(),
                tournament,
                vault,
                entry: *entry,
                player: *player,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        );
        send(svm, &authority, vec![ix], &[])
    };

    // The rug-laden player A never clears the threshold.
    let res_a = claim(&mut svm, &entry_a, &player_a.pubkey());
    assert!(res_a.is_err(), "player A should not be able to claim a prize");

    // Player B claims exactly the distributed pool (winners_count = 1).
    claim(&mut svm, &entry_b, &player_b.pubkey()).expect("player B claim should succeed");
    let balance_after = svm.get_balance(&player_b.pubkey()).unwrap();
    assert_eq!(balance_after - balance_before, expected_distributed, "winner payout mismatch");

    // Double-claiming must fail.
    let res_double = claim(&mut svm, &entry_b, &player_b.pubkey());
    assert!(res_double.is_err(), "double claim should be rejected");
}

/// Multiple mode: one wallet holds several independent entries in the same
/// tournament — real accounts, real distinct picks, all landing.
#[test]
fn test_multiple_entry_mode_allows_several_entries_per_wallet() {
    let program_id = pumpfantasy::ID;
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, program_bytes()).unwrap();
    let signer = load_attestation_signer();

    let authority = Keypair::new();
    let player = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&player.pubkey(), 10_000_000_000).unwrap();

    let now = svm.get_sysvar::<Clock>().unix_timestamp;
    let tournament_id: u64 = 2;
    let entry_fee_lamports: u64 = 500_000_000;
    let start_ts = now + 100;
    let end_ts = now + 200;
    let attestation_expiry = now + 60;

    let (tournament, _) = tournament_pda(&program_id, tournament_id);
    let (vault, _) = vault_pda(&program_id, &tournament);

    let create_ix = Instruction::new_with_bytes(
        program_id,
        &pumpfantasy::instruction::CreateTournament {
            id: tournament_id,
            entry_fee_lamports,
            start_ts,
            end_ts,
            entry_mode: pumpfantasy::EntryMode::Multiple,
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
    send(&mut svm, &authority, vec![create_ix], &[]).expect("create_tournament failed");

    let mints: Vec<Pubkey> = (0..5).map(|_| Pubkey::new_unique()).collect();
    let fp_cost = 500u32;

    let enter = |svm: &mut LiteSVM, entry_index: u16, order: &[usize]| -> Pubkey {
        let (entry, _) = entry_pda(&program_id, &tournament, &player.pubkey(), entry_index);
        let picks: [Pubkey; PICKS_PER_ENTRY] = std::array::from_fn(|i| mints[order[i]]);
        let fp_costs = [fp_cost; PICKS_PER_ENTRY];
        let message = attestation_message(&picks, &fp_costs, attestation_expiry);
        let ed25519_ix = build_ed25519_instruction(&signer, &message);
        let mut metas = pumpfantasy::accounts::EnterTournament {
            player: player.pubkey(),
            tournament,
            vault,
            entry,
            instructions_sysvar: solana_sdk_ids::sysvar::instructions::ID,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None);
        for mint in &picks {
            metas.push(anchor_lang::solana_program::instruction::AccountMeta::new(
                asset_pda(&program_id, &tournament, mint).0,
                false,
            ));
        }
        let enter_ix = Instruction::new_with_bytes(
            program_id,
            &pumpfantasy::instruction::EnterTournament { entry_index, picks, fp_costs, attestation_expiry }.data(),
            metas,
        );
        send(svm, &player, vec![ed25519_ix, enter_ix], &[]).expect("entry should succeed");
        entry
    };

    // Same wallet, two entries, deliberately different pick order — same
    // total budget by design here, the point is proving two independent
    // Entry accounts for one wallet in one tournament both land.
    let entry0 = enter(&mut svm, 0, &[0, 1, 2, 3, 4]);
    let entry1 = enter(&mut svm, 1, &[4, 3, 2, 1, 0]);
    assert_ne!(entry0, entry1, "each entry must be its own account");

    let load_entry = |svm: &LiteSVM, addr: &Pubkey| -> pumpfantasy::Entry {
        let acc = svm.get_account(addr).unwrap();
        pumpfantasy::Entry::try_deserialize(&mut acc.data.as_slice()).unwrap()
    };
    let state0 = load_entry(&svm, &entry0);
    let state1 = load_entry(&svm, &entry1);
    assert_eq!(state0.entry_index, 0);
    assert_eq!(state1.entry_index, 1);
    assert_eq!(state0.player, player.pubkey());
    assert_eq!(state1.player, player.pubkey());
    assert!(state1.created_at >= state0.created_at, "second entry should not be created before the first");

    let tournament_state: pumpfantasy::Tournament = {
        let acc = svm.get_account(&tournament).unwrap();
        pumpfantasy::Tournament::try_deserialize(&mut acc.data.as_slice()).unwrap()
    };
    assert_eq!(tournament_state.entry_count, 2, "both entries should be counted");
    assert_eq!(
        tournament_state.prize_pool_lamports,
        entry_fee_lamports * 2,
        "both entry fees should be in the pool"
    );
}
