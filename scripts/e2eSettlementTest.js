// End-to-end check of the automated payout pipeline on devnet: two wallets
// enter the newest cron-created tournament, then this just watches until the
// Worker (cron) has recorded prices, settled both entries, finalized and paid
// the winner. Uses the local Solana CLI keypair as wallet A and a fresh
// throwaway keypair (funded from A) as wallet B. Nothing here is committed
// with secrets — keys are read from ~/.config/solana/id.json.
//
//   node scripts/e2eSettlementTest.js            (newest cron-created tournament)
//   TOURNAMENT_ID=<id> node scripts/e2eSettlementTest.js   (a specific one, e.g. player-made)
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY, LAMPORTS_PER_SOL,
} = require("../worker/node_modules/@solana/web3.js");

const WORKER = "https://pumpfantasy-cron.swapkings.workers.dev";
const PROGRAM = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const ENTER_DISC = Buffer.from([19, 21, 109, 109, 227, 108, 232, 25]);
const TICK_MS = 300_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function u64le(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
const tournamentPda = (id) => PublicKey.findProgramAddressSync([Buffer.from("tournament"), u64le(id)], PROGRAM)[0];
const vaultPda = (t) => PublicKey.findProgramAddressSync([Buffer.from("vault"), t.toBuffer()], PROGRAM)[0];
function entryPda(t, player) {
  const idx = Buffer.alloc(2);
  return PublicKey.findProgramAddressSync([Buffer.from("entry"), t.toBuffer(), player.toBuffer(), idx], PROGRAM)[0];
}

async function enter(kp, tournament, mints) {
  const a = await (await fetch(WORKER + "/attest", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mints }),
  })).json();
  if (a.error) throw new Error("attest: " + a.error);
  const edIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: Uint8Array.from(a.publicKey), message: Uint8Array.from(a.message), signature: Uint8Array.from(a.signature),
  });
  const idx = Buffer.alloc(2);
  const fp = Buffer.alloc(20);
  a.picks.forEach((p, i) => fp.writeUInt32LE(p.fpCost, i * 4));
  const expiry = Buffer.alloc(8); expiry.writeBigInt64LE(BigInt(a.expiry));
  const data = Buffer.concat([ENTER_DISC, idx, ...a.picks.map((p) => new PublicKey(p.mint).toBuffer()), fp, expiry]);
  const ix = new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: vaultPda(tournament), isSigner: false, isWritable: true },
      { pubkey: entryPda(tournament, kp.publicKey), isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // the picked coins' price accounts — the first picker creates them and pays the rent
      ...a.picks.map((p) => ({
        pubkey: PublicKey.findProgramAddressSync([Buffer.from("asset"), tournament.toBuffer(), new PublicKey(p.mint).toBuffer()], PROGRAM)[0],
        isSigner: false,
        isWritable: true,
      })),
    ],
    data,
  });
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: kp.publicKey, blockhash, lastValidBlockHeight }).add(edIx, ix);
  tx.sign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return { sig, fp: a.picks.map((p) => `${p.tier}:${p.fpCost}`).join(" ") };
}

function readTournament(d) {
  return {
    startTs: Number(d.readBigInt64LE(56)), endTs: Number(d.readBigInt64LE(64)),
    entryCount: d.readUInt32LE(74), settledCount: d.readUInt32LE(78), pool: Number(d.readBigUInt64LE(82)),
    finalized: d[90] === 1, winners: d.readUInt32LE(91), threshold: d.readInt32LE(95), distributed: Number(d.readBigUInt64LE(99)),
  };
}

(async () => {
  const A = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))));
  const B = Keypair.generate();
  log("wallet A", A.publicKey.toBase58(), "balance", (await conn.getBalance(A.publicKey)) / LAMPORTS_PER_SOL);

  const candidates = (await (await fetch(WORKER + "/candidates")).json()).candidates;
  const byTier = (t) => candidates.filter((c) => c.tier === t);
  const mintsA = byTier("Hold").slice(0, 5).map((c) => c.mint); // 5 x 100 FP, calm
  const mintsB = ["Degen", "Moon", "Pump", "Farm", "Hold"].map((t) => byTier(t)[0].mint); // 3650 FP, volatile

  // wait for a fresh tick-aligned tournament whose entry window is still open
  // TOURNAMENT_ID=<id> targets a specific (e.g. player-made) tournament instead of the newest cron one.
  let id, tournament, t;
  for (;;) {
    id = process.env.TOURNAMENT_ID ? BigInt(process.env.TOURNAMENT_ID) : BigInt(Math.floor(Date.now() / TICK_MS) * TICK_MS);
    tournament = tournamentPda(id);
    const info = await conn.getAccountInfo(tournament);
    if (info) {
      t = readTournament(info.data);
      if (Date.now() / 1000 < t.startTs - 90) break;
    }
    log("waiting for the next cron tick to create a tournament…");
    await sleep(20_000);
  }
  log("tournament", id.toString(), tournament.toBase58(), "starts in", Math.round(t.startTs - Date.now() / 1000), "s");

  {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: A.publicKey, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: A.publicKey, toPubkey: B.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL }),
    );
    tx.sign(A);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    log("funded wallet B", B.publicKey.toBase58());
  }

  const balBefore = { A: await conn.getBalance(A.publicKey), B: await conn.getBalance(B.publicKey) };
  const ra = await enter(A, tournament, mintsA);
  log("A entered:", ra.fp);
  const rb = await enter(B, tournament, mintsB);
  log("B entered:", rb.fp);

  const deadline = Date.now() + 55 * 60_000;
  let lastLine = "";
  while (Date.now() < deadline) {
    const info = await conn.getAccountInfo(tournament);
    if (!info) {
      // The worker closed it: everything paid out, all rent returned, results archived.
      const after = { A: await conn.getBalance(A.publicKey), B: await conn.getBalance(B.publicKey) };
      const res = await fetch(WORKER + "/results/" + id.toString());
      const archived = res.ok ? await res.json() : null;
      log("CLOSED. balance change A", (after.A - balBefore.A) / 1e9, "B", (after.B - balBefore.B) / 1e9);
      log("archive:", archived ? archived.entries.length + " entries, " + archived.assets.length + " coins, winners " + archived.tournament.winnersCount + ", prizes " + archived.entries.map((e) => e.prizeLamports).join("/") : "MISSING");
      const left = await conn.getProgramAccounts(PROGRAM, { filters: [{ memcmp: { offset: 8, bytes: tournament.toBase58() } }] });
      log("accounts still on chain for this tournament:", left.length);
      return;
    }
    const s = readTournament(info.data);
    const entries = await conn.getProgramAccounts(PROGRAM, {
      filters: [{ dataSize: 253 }, { memcmp: { offset: 8, bytes: tournament.toBase58() } }],
    });
    const rows = entries.map(({ account: { data } }) => ({
      player: new PublicKey(data.subarray(40, 72)).toBase58().slice(0, 6),
      score: data.readInt32LE(238), settled: data[242] === 1, claimed: data[243] === 1,
    }));
    const line = `entries=${s.entryCount} settled=${s.settledCount} finalized=${s.finalized} winners=${s.winners} thr=${s.threshold} | ` +
      rows.map((r) => `${r.player}:${r.settled ? r.score : "-"}${r.claimed ? " PAID" : ""}`).join("  ");
    if (line !== lastLine) { log(line); lastLine = line; }
    if (s.finalized && rows.every((r) => !r.settled || r.claimed || r.score < s.threshold)) {
      const after = { A: await conn.getBalance(A.publicKey), B: await conn.getBalance(B.publicKey) };
      log("PAID. pool", s.pool / 1e9, "distributed", s.distributed / 1e9, "SOL; balance change A", (after.A - balBefore.A) / 1e9, "B", (after.B - balBefore.B) / 1e9, "— waiting for the worker to close everything");
    }
    await sleep(45_000);
  }
  log("TIMEOUT before payout completed — last state:", lastLine);
  process.exit(1);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
