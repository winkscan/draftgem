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
const TOURNAMENT_SIZE = 118;
const PER_TX = 6;
const SEND = process.argv.includes("--send");

(async () => {
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))),
  );
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const rentMin = BigInt(await conn.getMinimumBalanceForRentExemption(0));

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
    todo.push({ pubkey, spendable, d });
    total += spendable;
  }
  console.log(`${all.length} tournaments on chain, ${todo.length} with collectable fees: ${Number(total) / 1e9} SOL`);
  if (!SEND) return console.log("dry run — pass --send to collect");

  const idBuf = (d) => d.subarray(40, 48);
  const before = await conn.getBalance(authority.publicKey);
  let sent = 0;
  for (let i = 0; i < todo.length; i += PER_TX) {
    const ixs = todo.slice(i, i + PER_TX).map(({ pubkey, d }) => {
      const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), pubkey.toBuffer()], PROGRAM)[0];
      void idBuf;
      return new TransactionInstruction({
        programId: PROGRAM,
        keys: [
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: authority.publicKey, isSigner: false, isWritable: true }, // creator = us, 0 lamports
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([WITHDRAW_FEES_DISC, Buffer.alloc(8)]),
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
