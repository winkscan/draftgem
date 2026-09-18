// One-off devnet setup script: creates a real 10-minute tournament so the
// mobile app has something real to enter against. Run with the local
// Solana CLI keypair (already the program's upgrade authority) as the
// tournament authority.
//
// No asset pre-registration here anymore — under the lazy-registration
// architecture (see register_asset_price.rs) players draft from the
// Worker's full /candidates pool, and start/end prices for whatever mints
// they actually picked get registered automatically by the Worker's cron
// (or immediately via `curl <worker-url>/sync`) once this tournament's
// start_ts/end_ts pass. This script's only job is the create_tournament
// call itself.
const fs = require("fs");
const os = require("os");
const path = require("path");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");

const RPC_ENDPOINT = "https://api.devnet.solana.com";
const IDL_PATH = path.join(__dirname, "..", "target", "idl", "pumpfantasy.json");
const KEYPAIR_PATH = path.join(os.homedir(), ".config", "solana", "id.json");

const TOURNAMENT_ID = BigInt(Date.now()); // unique per run, avoids PDA collisions
const ENTRY_FEE_LAMPORTS = 10_000_000; // 0.01 SOL — cheap for repeated test entries

// Cycle through S / M / G for testing variety — real tournament-type choice
// is a later product decision, this is just so the app always has all
// three badge cases to look at. Guaranteed stacks on top of either mode
// (it's an independent flag), not a fourth mode.
// Keyed off the millisecond id itself, not the current minute — repeated
// manual runs within the same minute previously always landed on the same
// mode (confirmed live, 2026-09-18).
const runsSoFar = Number(TOURNAMENT_ID % 3n);
const ENTRY_MODE = runsSoFar === 1 ? { multiple: {} } : { single: {} };
const GUARANTEED_AMOUNT_LAMPORTS = runsSoFar === 2 ? 500_000_000 : 0; // 0.5 SOL example
const DURATION_SECONDS = 10 * 60; // 10 minutes, per the "easy to test" request
// Entries only accepted before start_ts (real lock-in, like a real DFS
// contest) — 20s was too tight for a human doing the full MWA connect →
// draft → approve flow by hand; widened for manual on-device testing.
// Kept at 10min (not longer) now that the scheduled task creates a new one
// every 5min — a longer window would pile up too many "upcoming" cards in
// Lobby at once. Independent of DURATION_SECONDS: the scheduler's 5min
// cadence ≤ this 10min round length is what actually guarantees Live is
// never empty (see tournamentPhase.ts's phase math) — this constant alone
// doesn't affect that.
const START_DELAY_SECONDS = 10 * 60;

function u64le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function tournamentPda(programId, id) {
  return PublicKey.findProgramAddressSync([Buffer.from("tournament"), u64le(id)], programId)[0];
}
function vaultPda(programId, tournament) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), tournament.toBuffer()], programId)[0];
}

async function main() {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);
  const programId = program.programId;

  const tournament = tournamentPda(programId, TOURNAMENT_ID);
  const vault = vaultPda(programId, tournament);

  const now = Math.floor(Date.now() / 1000);
  const startTs = now + START_DELAY_SECONDS;
  const endTs = startTs + DURATION_SECONDS;

  console.log(`Authority:  ${authority.publicKey.toBase58()}`);
  console.log(`Program:    ${programId.toBase58()}`);
  console.log(`Tournament: id=${TOURNAMENT_ID} pda=${tournament.toBase58()}`);
  console.log(`Starts in ${START_DELAY_SECONDS}s, runs for ${DURATION_SECONDS / 60} minutes`);
  console.log(`Mode: ${Object.keys(ENTRY_MODE)[0]}, guaranteed: ${GUARANTEED_AMOUNT_LAMPORTS / 1e9} SOL`);

  const createSig = await program.methods
    .createTournament(
      new anchor.BN(TOURNAMENT_ID.toString()),
      new anchor.BN(ENTRY_FEE_LAMPORTS),
      new anchor.BN(startTs),
      new anchor.BN(endTs),
      ENTRY_MODE,
      new anchor.BN(GUARANTEED_AMOUNT_LAMPORTS),
    )
    .accountsStrict({
      authority: authority.publicKey,
      tournament,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`create_tournament: ${createSig}`);

  console.log(`\nOpen the app and pull to refresh Lobby — tournament #${TOURNAMENT_ID} should appear.`);
  console.log(
    `Start/end prices for whatever mints get picked register automatically via the Worker cron ` +
      `(or run \`curl <worker-url>/sync\` right after start_ts/end_ts to force it for testing).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
