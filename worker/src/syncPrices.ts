import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "./env";
import { priceAtTimestamp, type PriceBudget } from "./priceHistory";
import type { TournamentStates } from "./tournamentState";

// Fills in the two things `enter_tournament` deliberately does NOT do: the
// shared START price of every picked coin (register_asset_price) and its END
// price (submit_result) — see those instructions for why both are lazy,
// per-coin and admin-attested. Prices come from candle HISTORY at exactly
// start_ts / end_ts (priceHistory.ts), so they don't depend on when a cron
// tick happens to run and a missed one can be filled in hours later; a live
// price is only a fallback for the first minutes after a timestamp, when
// history may not have caught up yet.

export const PROGRAM_ID = new PublicKey("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");
const ASSET_SEED = new TextEncoder().encode("asset");

// idl/pumpfantasy.json → instructions[].find(i => i.name === "...").discriminator
const REGISTER_ASSET_PRICE_DISCRIMINATOR = Uint8Array.from([43, 245, 161, 178, 99, 48, 249, 125]);
const SUBMIT_RESULT_DISCRIMINATOR = Uint8Array.from([240, 42, 89, 180, 10, 239, 9, 214]);

const PRICE_SCALE = 1_000_000; // matches constants::PRICE_SCALE in the Rust program
const LIVE_FALLBACK_SECONDS = 900; // how long after a timestamp a live price may stand in for missing history
const GECKO_CALLS_PER_TICK = 8; // GeckoTerminal's free tier 429s quickly; leftovers wait for the next tick

// 8-byte discriminator + state.rs's own field layout, in declaration order.
export const TOURNAMENT_SIZE = 118;
export const ENTRY_SIZE = 253;
export const ASSET_SIZE = 90; // 8 discriminator + 32 + 32 + 8 + 8 + 1 + 1 (state.rs AssetPrice)

export function u64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
export function concatBytes(...parts: Uint8Array[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

export function loadAuthority(secret: string): Keypair {
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

/** Best-effort live USD price per mint — only ever a fallback (see LIVE_FALLBACK_SECONDS). */
async function fetchLivePrices(mints: string[]): Promise<Map<string, number>> {
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

export async function fetchTournamentScopedAccounts(connection: Connection, dataSize: number, tournament: PublicKey) {
  return connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize }, { memcmp: { offset: 8, bytes: tournament.toBase58() } }],
  });
}

/** History first; a live price only within LIVE_FALLBACK_SECONDS of `ts`. null = try again next tick. */
async function resolvePrice(
  env: Env,
  mint: string,
  ts: number,
  nowSec: number,
  budget: PriceBudget,
  live: () => Promise<Map<string, number>>,
): Promise<bigint | null> {
  let price = await priceAtTimestamp(env, mint, ts, budget);
  if (price == null && nowSec - ts <= LIVE_FALLBACK_SECONDS) price = (await live()).get(mint) ?? null;
  if (price == null) return null;
  const micros = Math.round(price * PRICE_SCALE);
  return micros > 0 ? BigInt(micros) : null; // register_asset_price itself rejects 0
}

/** Registers the start price for every picked coin that lacks one. `complete` = none left. */
async function registerMissingStartPrices(
  env: Env,
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
  startTs: number,
  nowSec: number,
  budget: PriceBudget,
): Promise<{ count: number; complete: boolean }> {
  const entryAccounts = await fetchTournamentScopedAccounts(connection, ENTRY_SIZE, tournament);
  const pickedMints = new Set<string>();
  for (const { account } of entryAccounts) {
    for (let i = 0; i < 5; i++) {
      const offset = 74 + 32 * i;
      pickedMints.add(new PublicKey(account.data.subarray(offset, offset + 32)).toBase58());
    }
  }
  if (pickedMints.size === 0) return { count: 0, complete: true };

  const assetAccounts = await fetchTournamentScopedAccounts(connection, ASSET_SIZE, tournament);
  const alreadyRegistered = new Set<string>();
  for (const { account } of assetAccounts) {
    alreadyRegistered.add(new PublicKey(account.data.subarray(40, 72)).toBase58());
  }

  const missing = [...pickedMints].filter((m) => !alreadyRegistered.has(m));
  if (missing.length === 0) return { count: 0, complete: true };

  let liveCache: Map<string, number> | null = null;
  const live = async () => (liveCache ??= await fetchLivePrices(missing));

  let count = 0;
  for (const mintStr of missing) {
    const micros = await resolvePrice(env, mintStr, startTs, nowSec, budget, live);
    if (micros == null) continue;

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
      data: concatBytes(REGISTER_ASSET_PRICE_DISCRIMINATOR, mint.toBytes(), u64le(micros)),
    });
    await sendAndConfirm(connection, authority, [ix]);
    count++;
  }
  return { count, complete: count === missing.length };
}

/** Submits the end price for every registered coin still unresolved. `complete` = none left. */
async function submitMissingEndPrices(
  env: Env,
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
  endTs: number,
  nowSec: number,
  budget: PriceBudget,
): Promise<{ count: number; complete: boolean }> {
  const assetAccounts = await fetchTournamentScopedAccounts(connection, ASSET_SIZE, tournament);
  const unresolved = assetAccounts.filter(({ account }) => account.data[88] === 0);
  if (unresolved.length === 0) return { count: 0, complete: true };

  const mints = unresolved.map(({ account }) => new PublicKey(account.data.subarray(40, 72)).toBase58());
  let liveCache: Map<string, number> | null = null;
  const live = async () => (liveCache ??= await fetchLivePrices(mints));

  let count = 0;
  for (const { pubkey: asset, account } of unresolved) {
    const mintStr = new PublicKey(account.data.subarray(40, 72)).toBase58();
    const micros = await resolvePrice(env, mintStr, endTs, nowSec, budget, live);
    if (micros == null) continue;

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: tournament, isSigner: false, isWritable: false },
        { pubkey: asset, isSigner: false, isWritable: true },
      ],
      data: concatBytes(SUBMIT_RESULT_DISCRIMINATOR, u64le(micros)),
    });
    await sendAndConfirm(connection, authority, [ix]);
    count++;
  }
  return { count, complete: count === unresolved.length };
}

export const TICK_MS = 300_000; // must match wrangler.toml's cron cadence
export const ROUND_SECONDS = 600; // entry window and round length (index.ts)
/** How long after a tournament ends the Worker keeps working on it (prices, settlement, refund). */
export const HISTORY_WINDOW_SECONDS = 3 * 3600;
const TOURNAMENT_SEED = new TextEncoder().encode("tournament");

export function tournamentPdaFor(id: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([TOURNAMENT_SEED, u64le(id)], PROGRAM_ID)[0];
}

export interface Candidate {
  pubkey: PublicKey;
  data: Uint8Array;
}

// Helius bills getProgramAccounts at 10 credits/call vs 1 for
// getMultipleAccounts, and every cron tick used to gPA-scan every tournament
// ever created (300 and growing by 288/day, all still Open) — measured
// 2026-09-19 as the cause of the devnet credit spike (~50K/day vs the ~2.5K
// baseline). So: the cron path never lists tournaments — the Worker mints
// tournament ids from its own 5-min tick (index.ts), so the ones inside the
// work window are computed as PDAs and fetched in ONE getMultipleAccounts,
// shared by price sync and settlement; tournaments nobody entered are
// skipped; and per-tournament progress lives in KV (tournamentState.ts).
/**
 * Cron path (default): tick-aligned tournaments that have started, up to
 * HISTORY_WINDOW_SECONDS after they ended, minus those already fully done.
 * `full` (manual `?full=1`) is the expensive repair path — one
 * getProgramAccounts over every tournament — for ones whose ids aren't
 * tick-aligned (manual / script-created).
 */
export async function findCandidates(
  connection: Connection,
  states: TournamentStates,
  opts: { full?: boolean } = {},
): Promise<Candidate[]> {
  if (opts.full) {
    const all = await connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: TOURNAMENT_SIZE }] });
    return all.map(({ pubkey, account }) => ({ pubkey, data: account.data }));
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const tickSec = TICK_MS / 1000;
  const nowAligned = Math.floor(nowSec / tickSec) * tickSec;
  // minted at tick T: starts at T+ROUND, ends at T+2*ROUND
  const pdas: PublicKey[] = [];
  for (let t = nowAligned - 2 * ROUND_SECONDS - HISTORY_WINDOW_SECONDS; t <= nowAligned - ROUND_SECONDS; t += tickSec) {
    if (!states[String(t * 1000)]?.settled) pdas.push(tournamentPdaFor(BigInt(t) * 1000n));
  }
  if (pdas.length === 0) return [];
  const infos = await connection.getMultipleAccountsInfo(pdas);
  const out: Candidate[] = [];
  infos.forEach((info, i) => {
    if (info && info.data.length === TOURNAMENT_SIZE) out.push({ pubkey: pdas[i], data: info.data });
  });
  return out;
}

export async function syncPrices(
  env: Env,
  connection: Connection,
  candidates: Candidate[],
  states: TournamentStates,
): Promise<string> {
  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const nowSec = Math.floor(Date.now() / 1000);
  const budget: PriceBudget = { geckoCalls: GECKO_CALLS_PER_TICK };

  let registered = 0;
  let resolved = 0;
  for (const c of candidates) {
    const view = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    const id = view.getBigUint64(40, true).toString();
    if (view.getUint32(74, true) === 0) continue; // entry_count: nobody entered, nothing to price
    const st = (states[id] ??= {});
    if (st.settled) continue;
    const startTs = Number(view.getBigInt64(56, true));
    const endTs = Number(view.getBigInt64(64, true));

    if (!st.start && nowSec >= startTs) {
      const r = await registerMissingStartPrices(env, connection, authority, c.pubkey, startTs, nowSec, budget);
      registered += r.count;
      if (r.complete) st.start = true;
    }
    // End prices need every start price first (an unregistered coin has no asset account to resolve).
    if (st.start && !st.end && nowSec >= endTs) {
      const r = await submitMissingEndPrices(env, connection, authority, c.pubkey, endTs, nowSec, budget);
      resolved += r.count;
      if (r.complete) st.end = true;
    }
  }

  return `${registered} start price(s) registered, ${resolved} end price(s) submitted across ${candidates.length} candidate tournament(s)`;
}
