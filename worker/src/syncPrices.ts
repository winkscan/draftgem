import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "./env";

// Fills in the two things `enter_tournament` deliberately does NOT do
// anymore: registering each picked mint's shared start price (once, right
// after a tournament's entry window locks) and submitting its end price
// (once the round is over) — see register_asset_price.rs / submit_result.rs
// for why both are lazy, per-mint, and admin-attested rather than
// pre-populated. This is what actually keeps that promise: a scan run every
// cron tick, not a one-off script.
//
// Known limitation, not a bug to "fix" here: since there's no historical
// price oracle for arbitrary Solana meme tokens, "the price at start_ts" is
// really "the price the first cron tick after start_ts happened to see" —
// up to one cron interval (see wrangler.toml) of drift. Acceptable for a
// hackathon prototype; a tighter cadence would shrink it, not eliminate it.

const PROGRAM_ID = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
const ASSET_SEED = new TextEncoder().encode("asset");

// idl/pumpfantasy.json → instructions[].find(i => i.name === "...").discriminator
const REGISTER_ASSET_PRICE_DISCRIMINATOR = Uint8Array.from([43, 245, 161, 178, 99, 48, 249, 125]);
const SUBMIT_RESULT_DISCRIMINATOR = Uint8Array.from([240, 42, 89, 180, 10, 239, 9, 214]);

const PRICE_SCALE = 1_000_000; // matches constants::PRICE_SCALE in the Rust program

// 8-byte discriminator + state.rs's own field layout, in declaration order.
const TOURNAMENT_SIZE = 118;
const ENTRY_SIZE = 253;
const ASSET_SIZE = 98;

function u64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function concatBytes(...parts: Uint8Array[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

function loadAuthority(secret: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret.trim())));
}

async function waitForConfirmation(connection: Connection, sig: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { value } = await connection.getSignatureStatuses([sig]);
    const status = value[0];
    if (status?.err) throw new Error(`Transaction ${sig} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
  }
  throw new Error(`Transaction ${sig} did not confirm within the wait budget`);
}

async function sendAndConfirm(connection: Connection, authority: Keypair, ixs: TransactionInstruction[]): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: authority.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(authority);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await waitForConfirmation(connection, sig);
  return sig;
}

interface JupiterPriceToken {
  id: string;
  usdPrice?: number;
}

/** Best-effort live USD price per mint. A mint missing from the result just means "try again next tick", not an error. */
async function fetchUsdPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (mints.length === 0) return out;
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(",")}`);
  if (!res.ok) return out;
  const data = (await res.json()) as JupiterPriceToken[];
  for (const t of data) {
    if (typeof t.usdPrice === "number") out.set(t.id, t.usdPrice);
  }
  return out;
}

async function fetchTournamentScopedAccounts(connection: Connection, dataSize: number, tournament: PublicKey) {
  return connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize }, { memcmp: { offset: 8, bytes: tournament.toBase58() } }],
  });
}

/** Registers a start price for every mint picked in this tournament that doesn't have one yet. Returns how many it registered. */
async function registerMissingStartPrices(connection: Connection, authority: Keypair, tournament: PublicKey): Promise<number> {
  const entryAccounts = await fetchTournamentScopedAccounts(connection, ENTRY_SIZE, tournament);
  const pickedMints = new Set<string>();
  for (const { account } of entryAccounts) {
    for (let i = 0; i < 5; i++) {
      const offset = 74 + 32 * i;
      pickedMints.add(new PublicKey(account.data.subarray(offset, offset + 32)).toBase58());
    }
  }
  if (pickedMints.size === 0) return 0;

  const assetAccounts = await fetchTournamentScopedAccounts(connection, ASSET_SIZE, tournament);
  const alreadyRegistered = new Set<string>();
  for (const { account } of assetAccounts) {
    alreadyRegistered.add(new PublicKey(account.data.subarray(40, 72)).toBase58());
  }

  const missing = [...pickedMints].filter((m) => !alreadyRegistered.has(m));
  if (missing.length === 0) return 0;

  const prices = await fetchUsdPrices(missing);
  let count = 0;
  for (const mintStr of missing) {
    const priceUsd = prices.get(mintStr);
    if (priceUsd === undefined) continue; // no live price this tick — retried next tick
    const priceMicros = Math.round(priceUsd * PRICE_SCALE);
    if (priceMicros <= 0) continue; // register_asset_price itself rejects 0

    const mint = new PublicKey(mintStr);
    const [asset] = PublicKey.findProgramAddressSync([ASSET_SEED, tournament.toBuffer(), mint.toBuffer()], PROGRAM_ID);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: tournament, isSigner: false, isWritable: true },
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: concatBytes(REGISTER_ASSET_PRICE_DISCRIMINATOR, mint.toBytes(), u64le(priceMicros)),
    });
    await sendAndConfirm(connection, authority, [ix]);
    count++;
  }
  return count;
}

/** Submits an end price for every still-unresolved registered asset in this tournament. Returns how many it submitted. */
async function submitMissingEndPrices(connection: Connection, authority: Keypair, tournament: PublicKey): Promise<number> {
  const assetAccounts = await fetchTournamentScopedAccounts(connection, ASSET_SIZE, tournament);
  const unresolved = assetAccounts.filter(({ account }) => account.data[88] === 0);
  if (unresolved.length === 0) return 0;

  const mints = unresolved.map(({ account }) => new PublicKey(account.data.subarray(40, 72)).toBase58());
  const prices = await fetchUsdPrices(mints);

  let count = 0;
  for (const { pubkey: asset, account } of unresolved) {
    const mintStr = new PublicKey(account.data.subarray(40, 72)).toBase58();
    const priceUsd = prices.get(mintStr);
    if (priceUsd === undefined) continue; // no live price this tick — retried next tick; 0 (rug) only submitted once we've actually confirmed it, never assumed
    const priceMicros = Math.round(priceUsd * PRICE_SCALE);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: tournament, isSigner: false, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: true },
      ],
      data: concatBytes(SUBMIT_RESULT_DISCRIMINATOR, u64le(priceMicros)),
    });
    await sendAndConfirm(connection, authority, [ix]);
    count++;
  }
  return count;
}

// Helius bills getProgramAccounts at 10 credits/call vs 1 for
// getMultipleAccounts, and every cron tick used to gPA-scan every tournament
// ever created (300 and growing by 288/day, all still Open) — measured
// 2026-09-19 as the cause of the devnet credit spike (~50K/day vs the ~2.5K
// baseline). Two fixes: (1) tournaments nobody entered (entry_count == 0,
// the vast majority) have nothing to price, so they're skipped outright;
// (2) the cron path doesn't list tournaments at all — the Worker mints
// tournament ids from its own 5-min tick (see index.ts), so the handful
// whose start/end just passed are computed and fetched in ONE
// getMultipleAccounts call. Prices are also only ever written inside a
// SYNC_WINDOW of start/end: "the price at start_ts" registered an hour late
// isn't the price at start_ts.
export const TICK_MS = 300_000; // must match wrangler.toml's cron cadence
export const ROUND_SECONDS = 600; // entry window and round length (index.ts)
const SYNC_WINDOW_SECONDS = 900;
const TOURNAMENT_SEED = new TextEncoder().encode("tournament");

function tournamentPdaFor(id: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([TOURNAMENT_SEED, u64le(id)], PROGRAM_ID)[0];
}

async function processTournament(
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
  data: Uint8Array,
  nowSec: number,
  windowed: boolean,
): Promise<{ registered: number; resolved: number }> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const none = { registered: 0, resolved: 0 };
  if (view.getUint8(90) !== 0) return none; // 0 = Open, 1 = Finalized
  if (view.getUint32(74, true) === 0) return none; // entry_count: nobody entered, nothing to price
  const startTs = Number(view.getBigInt64(56, true));
  const endTs = Number(view.getBigInt64(64, true));
  const inWindow = (t: number) => nowSec >= t && (!windowed || nowSec < t + SYNC_WINDOW_SECONDS);

  return {
    registered: inWindow(startTs) ? await registerMissingStartPrices(connection, authority, tournament) : 0,
    resolved: inWindow(endTs) ? await submitMissingEndPrices(connection, authority, tournament) : 0,
  };
}

/**
 * Cron path (default): looks only at the few tick-aligned tournaments whose
 * start/end just passed. `full` (manual `/sync?full=1`) is the expensive
 * repair path — one getProgramAccounts over every tournament, no time
 * window — for tournaments the tick math can't find (e.g. ones created by
 * scripts/createTestTournament.js with arbitrary ids).
 */
export async function syncPrices(env: Env, opts: { full?: boolean } = {}): Promise<string> {
  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const connection = new Connection(`https://devnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`, "confirmed");
  const nowSec = Math.floor(Date.now() / 1000);

  let candidates: { pubkey: PublicKey; data: Uint8Array }[];
  if (opts.full) {
    const all = await connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: TOURNAMENT_SIZE }] });
    candidates = all.map(({ pubkey, account }) => ({ pubkey, data: account.data }));
  } else {
    const tickSec = TICK_MS / 1000;
    const nowAligned = Math.floor(nowSec / tickSec) * tickSec;
    // A tournament minted at tick T starts at T+ROUND and ends at T+2*ROUND,
    // so ones still inside a sync window were minted in (now-2*ROUND-WINDOW, now-ROUND].
    const pdas: PublicKey[] = [];
    for (let t = nowAligned - 2 * ROUND_SECONDS - SYNC_WINDOW_SECONDS; t <= nowAligned - ROUND_SECONDS; t += tickSec) {
      pdas.push(tournamentPdaFor(BigInt(t) * 1000n));
    }
    const infos = await connection.getMultipleAccountsInfo(pdas);
    candidates = [];
    infos.forEach((info, i) => {
      if (info && info.data.length === TOURNAMENT_SIZE) candidates.push({ pubkey: pdas[i], data: info.data });
    });
  }

  let registered = 0;
  let resolved = 0;
  for (const c of candidates) {
    const r = await processTournament(connection, authority, c.pubkey, c.data, nowSec, !opts.full);
    registered += r.registered;
    resolved += r.resolved;
  }
  return `${registered} start price(s) registered, ${resolved} end price(s) submitted across ${candidates.length} candidate tournament(s)${opts.full ? " (full scan)" : ""}`;
}
