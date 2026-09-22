// One-off: collect the platform's fees that piled up in the vaults of tournaments
// finalized BEFORE withdraw_fees existed. Safe at any time after finalizing — the
// program only pays out prize_pool - distributed_pool, always leaves one rent
// reserve, and lowers prize_pool by what it pays, so running it twice is harmless.
//
//   node scripts/sweepFees.js          dry run: how much is there to collect
//   node scripts/sweepFees.js --send   do it (fees go to the local wallet = authority)
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("../worker/node_modules/@solana/web3.js");

const PROGRAM = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
const WITHDRAW_FEES_DISC = Buffer.from([198, 212, 171, 109, 144, 215, 174, 89]);
const TOURNAMENT_SIZE = 127; // +prizes_assigned_lamports(8) +prizes_finalized(1)
const PER_TX = 6;
const SEND = process.argv.includes("--send");

(async () => {
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))),
  );
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const rentMin = BigInt(await conn.getMinimumBalanceForRentExemption(0));
  // Player-made tournaments made since creators earn a cut: that share must go to the creator, not to us.
  const meta = (await (await fetch("https://pumpfantasy-cron.swapkings.workers.dev/tournament-meta")).json()).meta || {};

  const all = await conn.getProgramAccounts(PROGRAM, { filters: [{ dataSize: TOURNAMENT_SIZE }] });
  const todo = [];
  let total = 0n;
  for (const { pubkey, account } of all) {
    const d = account.data;
    const authorityKey = new PublicKey(d.subarray(8, 40));
    if (!authorityKey.equals(authority.publicKey)) continue;
    if (d[90] !== 1) continue; // finalized only
    const pool = d.readBigUInt64LE(82);
    const distributed = d.readBigUInt64LE(99);
    const fees = pool > distributed ? pool - distributed : 0n;
    const spendable = fees > rentMin ? fees - rentMin : 0n;
    if (spendable === 0n) continue;
    const m = meta[d.readBigUInt64LE(40).toString()];
    let creator = null;
    let creatorLamports = 0n;
    if (m && m.creatorFeeBps > 0) {
      const rake = (pool * 500n) / 10000n;
      const cap = fees > rake ? fees - rake : 0n;
      creator = new PublicKey(m.creator);
      creatorLamports = cap < spendable ? cap : spendable;
    }
    todo.push({ pubkey, spendable, d, creator, creatorLamports });
    total += spendable;
  }
  console.log(`${all.length} tournaments on chain, ${todo.length} with collectable fees: ${Number(total) / 1e9} SOL`);
  if (!SEND) return console.log("dry run — pass --send to collect");

  const before = await conn.getBalance(authority.publicKey);
  let sent = 0;
  for (let i = 0; i < todo.length; i += PER_TX) {
    const ixs = todo.slice(i, i + PER_TX).map(({ pubkey, creator, creatorLamports }) => {
      const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), pubkey.toBuffer()], PROGRAM)[0];
      return new TransactionInstruction({
        programId: PROGRAM,
        keys: [
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: creator || authority.publicKey, isSigner: false, isWritable: true }, // the creator, or us with 0 lamports
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([WITHDRAW_FEES_DISC, (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(creatorLamports); return b; })()]),
      });
    });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: authority.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
    tx.sign(authority);
    try {
      const sig = await conn.sendRawTransaction(tx.serialize());
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      sent += ixs.length;
    } catch (e) {
      console.error(`batch at ${i} failed:`, e.message?.slice(0, 200));
    }
    if ((i / PER_TX) % 10 === 0) console.log(`  ${Math.min(i + PER_TX, todo.length)}/${todo.length}`);
  }
  const after = await conn.getBalance(authority.publicKey);
  console.log(`collected from ${sent} tournaments; wallet ${(before / 1e9).toFixed(5)} -> ${(after / 1e9).toFixed(5)} SOL`);
})();
