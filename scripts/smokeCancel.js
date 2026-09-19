// Simulates cancel_tournament on a recent (still inside its grace period)
// tournament with the local authority key. Nothing is sent; the point is the
// error: TooEarlyToCancel (0x1785) proves the instruction exists on the
// deployed program and enforces the grace period.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require("../worker/node_modules/@solana/web3.js");

const PROGRAM = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
const CANCEL_DISC = Buffer.from([249, 227, 133, 5, 9, 142, 29, 122]);

(async () => {
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))),
  );
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  // newest tick-aligned tournament that has already ended (< 1h ago)
  const nowMs = Date.now();
  const id = BigInt(Math.floor((nowMs - 25 * 60_000) / 300_000) * 300_000);
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(id);
  const tournament = PublicKey.findProgramAddressSync([Buffer.from("tournament"), idBuf], PROGRAM)[0];

  const ix = new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: true },
    ],
    data: CANCEL_DISC,
  });
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: authority.publicKey, recentBlockhash: blockhash }).add(ix);
  tx.sign(authority);
  const sim = await conn.simulateTransaction(tx);
  console.log("tournament", id.toString());
  console.log("error:", JSON.stringify(sim.value.err));
  console.log((sim.value.logs || []).filter((l) => /Error|Instruction|failed/.test(l)).join("\n"));
})();
