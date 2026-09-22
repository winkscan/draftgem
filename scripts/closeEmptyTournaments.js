// One-off: get back the rent of every tournament that never had a single entry. Such a
// tournament costs us ~0.00125 SOL to create and holds nothing, and the worker now closes
// them itself every tick — this cleans up the ones created before that existed.
//
//   node scripts/closeEmptyTournaments.js          dry run: how much is there to recover
//   node scripts/closeEmptyTournaments.js --send   close them
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
const CLOSE_TOURNAMENT_DISC = Buffer.from([14, 80, 54, 9, 221, 239, 201, 35]);
const TOURNAMENT_SIZE = 118;
const PER_TX = 6;
const SEND = process.argv.includes("--send");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The public devnet RPC rate-limits hard: retry with a growing pause.
async function retry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 14 || !/429|Too many/i.test(String(e.message))) throw e;
      await sleep(10000 * Math.min(attempt + 1, 6));
    }
  }
}

(async () => {
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))),
  );
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const now = Math.floor(Date.now() / 1000);
  const tournamentRent = await retry(() => conn.getMinimumBalanceForRentExemption(TOURNAMENT_SIZE));

  const all = await retry(() => conn.getProgramAccounts(PROGRAM, { filters: [{ dataSize: TOURNAMENT_SIZE }] }));
  const todo = all.filter(({ account }) => {
    const d = account.data;
    return (
      new PublicKey(d.subarray(8, 40)).equals(authority.publicKey) &&
      d.readUInt16LE(72) === 0 && // asset_count
      d.readUInt32LE(74) === 0 && // entry_count
      now >= Number(d.readBigInt64LE(56)) // entries are locked from start_ts on
    );
  });
  console.log(`${all.length} tournaments on chain, ${todo.length} never had an entry: ${(todo.length * tournamentRent) / 1e9} SOL to recover`);
  if (!SEND) return console.log("dry run — pass --send to close them");

  const before = await retry(() => conn.getBalance(authority.publicKey));
  let closed = 0;
  for (let i = 0; i < todo.length; i += PER_TX) {
    const ixs = todo.slice(i, i + PER_TX).map(({ pubkey }) => {
      const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), pubkey.toBuffer()], PROGRAM)[0];
      return new TransactionInstruction({
        programId: PROGRAM,
        keys: [
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: CLOSE_TOURNAMENT_DISC,
      });
    });
    const { blockhash, lastValidBlockHeight } = await retry(() => conn.getLatestBlockhash());
    const tx = new Transaction({ feePayer: authority.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
    tx.sign(authority);
    try {
      const sig = await retry(() => conn.sendRawTransaction(tx.serialize()));
      for (let k = 0; k < 20; k++) {
        await sleep(1500);
        const { value } = await retry(() => conn.getSignatureStatuses([sig]));
        if (value[0]?.err) throw new Error(JSON.stringify(value[0].err));
        if (value[0]?.confirmationStatus === "confirmed" || value[0]?.confirmationStatus === "finalized") break;
      }
      closed += ixs.length;
    } catch (e) {
      console.error(`batch at ${i} failed:`, String(e.message).slice(0, 200));
    }
    await sleep(300);
    if ((i / PER_TX) % 20 === 0) console.log(`  ${Math.min(i + PER_TX, todo.length)}/${todo.length}`);
  }
  const after = await retry(() => conn.getBalance(authority.publicKey));
  console.log(`closed ${closed}; wallet ${(before / 1e9).toFixed(4)} -> ${(after / 1e9).toFixed(4)} SOL`);
})();
