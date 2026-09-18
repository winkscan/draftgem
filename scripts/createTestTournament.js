// One-off devnet setup script: creates a real 10-minute tournament with a
// 7-coin asset universe (same fp_cost/start_price values as the Rust
// integration test, for easy cross-checking) so the mobile app has
// something real to enter against. Run with the local Solana CLI keypair
// (already the program's upgrade authority) as the tournament authority.
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

// Real mainnet mint addresses (not random keypairs) so Jupiter's Token API
// / DexScreener can actually resolve real names+icons for them in the app —
// the program never validates the mint account itself, so a mainnet
// address is a perfectly fine opaque reference even while this program
// lives on devnet. Spread from old/blue-chip (cheap FP) to
// new/volatile-feeling (expensive FP), previewing the age-tier pricing
// idea even though real age-based pricing isn't wired up yet.
const ASSETS = [
  { label: "SOL", fpCost: 100, startPrice: 20_000_000, mint: "So11111111111111111111111111111111111111112" },
  { label: "USDC", fpCost: 200, startPrice: 1_000_000, mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { label: "JUP", fpCost: 400, startPrice: 1_000_000, mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { label: "PYTH", fpCost: 600, startPrice: 500_000, mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
  { label: "RENDER", fpCost: 800, startPrice: 800_000, mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof" },
  { label: "WIF", fpCost: 1200, startPrice: 2_000_000, mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { label: "BONK", fpCost: 1500, startPrice: 100_000, mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
];

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
function assetPda(programId, tournament, mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("asset"), tournament.toBuffer(), mint.toBuffer()],
    programId,
  )[0];
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

  const createdAssets = [];
  for (const a of ASSETS) {
    const mint = new PublicKey(a.mint);
    const asset = assetPda(programId, tournament, mint);
    const sig = await program.methods
      .addAsset(mint, a.fpCost, new anchor.BN(a.startPrice))
      .accountsStrict({
        authority: authority.publicKey,
        tournament,
        asset,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    createdAssets.push({ ...a, mint: mint.toBase58(), asset: asset.toBase58() });
    console.log(`add_asset ${a.label.padEnd(16)} fp=${String(a.fpCost).padEnd(5)} mint=${mint.toBase58()}  (${sig})`);
  }

  console.log("\nDone. Asset universe:");
  console.table(createdAssets.map(({ label, fpCost, startPrice, mint }) => ({ label, fpCost, startPrice, mint })));
  console.log(`\nOpen the app and pull to refresh Lobby — tournament #${TOURNAMENT_ID} should appear.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
