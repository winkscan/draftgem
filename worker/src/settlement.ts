import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "./env";
import type { TournamentStates } from "./tournamentState";
import { CREATOR_FEE_BPS, getSettlementInfo, type SettlementInfo } from "./customTournaments";
import { hasResult, saveResult, type ArchivedResult } from "./archive";
import {
  ASSET_SIZE,
  ENTRY_SIZE,
  PROGRAM_ID,
  concatBytes,
  u64le,
  fetchTournamentScopedAccounts,
  loadAuthority,
  type Candidate,
} from "./syncPrices";

// Pays tournaments out with no human in the loop, using the three permissionless
// steps the program already has: settle_entry (score one entry from the shared
// start/end prices), finalize_tournament (authority fixes the winners'
// threshold), claim_prize (anyone can trigger, money only ever goes to
// entry.player). The Worker is just the cranker.
//
// Helius cost (the reason this is shaped the way it is — see the 2026-09-19
// credit spike): candidate tournaments are found by the clock, not listed
// (one getMultipleAccounts); tournaments nobody entered are skipped; only
// tournaments that actually have entries cost anything (2 getProgramAccounts
// to read state, +1 to re-read scores before finalizing); and a finished
// tournament is recorded in KV so it is never touched again.

const SETTLE_DISC = Uint8Array.from([22, 208, 102, 127, 180, 201, 120, 68]);
const FINALIZE_DISC = Uint8Array.from([205, 30, 149, 11, 108, 122, 120, 11]);
const CLAIM_DISC = Uint8Array.from([157, 233, 139, 121, 246, 62, 234, 235]);
const CANCEL_DISC = Uint8Array.from([249, 227, 133, 5, 9, 142, 29, 122]);
const REFUND_DISC = Uint8Array.from([214, 5, 136, 23, 253, 7, 230, 81]);
const WITHDRAW_FEES_DISC = Uint8Array.from([198, 212, 171, 109, 144, 215, 174, 89]);
const CLOSE_ENTRY_DISC = Uint8Array.from([132, 26, 202, 145, 190, 37, 114, 67]);
const CLOSE_ASSET_PRICE_DISC = Uint8Array.from([118, 156, 47, 26, 189, 189, 198, 129]);
const CLOSE_TOURNAMENT_DISC = Uint8Array.from([14, 80, 54, 9, 221, 239, 201, 35]);

// constants::CANCEL_GRACE_SECONDS — how long after end_ts the program refuses a cancel.
// Until then, missing prices are just retried (history never expires).
const CANCEL_GRACE_SECONDS = 3_600;

const ASSET_SEED = new TextEncoder().encode("asset");
const VAULT_SEED = new TextEncoder().encode("vault");

const SETTLES_PER_TX = 3; // 3 settle ixs + their 15 asset accounts fit a legacy tx comfortably
const CLAIMS_PER_TX = 5;
const MAX_TX_PER_STEP = 16; // per tournament per tick; the rest continues next tick

interface EntryRow {
  pubkey: PublicKey;
  player: PublicKey;
  entryIndex: number;
  picks: PublicKey[];
  fpSpent: number;
  scoreBps: number;
  settled: boolean;
  claimed: boolean;
  createdAt: number;
}

// Byte offsets follow programs/pumpfantasy/src/state.rs (8-byte discriminator first).
function decodeEntry(pubkey: PublicKey, data: Uint8Array): EntryRow {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const picks: PublicKey[] = [];
  for (let i = 0; i < 5; i++) picks.push(new PublicKey(data.subarray(74 + 32 * i, 74 + 32 * i + 32)));
  return {
    pubkey,
    player: new PublicKey(data.subarray(40, 72)),
    entryIndex: view.getUint16(72, true),
    picks,
    fpSpent: view.getUint32(234, true),
    scoreBps: view.getInt32(238, true),
    settled: data[242] !== 0,
    claimed: data[243] !== 0,
    createdAt: Number(view.getBigInt64(244, true)),
  };
}

interface AssetRow {
  pubkey: PublicKey;
  mint: PublicKey;
  startMicros: bigint;
  endMicros: bigint;
  payer: PublicKey;
}

// AssetPrice layout: disc 8, tournament 32, mint 32 (40..72), start u64 (72..80), end u64 (80..88), resolved, bump, payer 32 (90..122).
async function readAssetRows(connection: Connection, tournament: PublicKey): Promise<AssetRow[]> {
  const raw = await fetchTournamentScopedAccounts(connection, ASSET_SIZE, tournament);
  return raw.map(({ pubkey, account }) => {
    const v = new DataView(account.data.buffer, account.data.byteOffset, account.data.byteLength);
    return {
      pubkey,
      mint: new PublicKey(account.data.subarray(40, 72)),
      startMicros: v.getBigUint64(72, true),
      endMicros: v.getBigUint64(80, true),
      payer: new PublicKey(account.data.subarray(90, 122)),
    };
  });
}

async function readEntries(connection: Connection, tournament: PublicKey): Promise<EntryRow[]> {
  const raw = await fetchTournamentScopedAccounts(connection, ENTRY_SIZE, tournament);
  return raw.map(({ pubkey, account }) => decodeEntry(pubkey, account.data));
}

async function readAssets(connection: Connection, tournament: PublicKey): Promise<Map<string, { resolved: boolean }>> {
  const raw = await fetchTournamentScopedAccounts(connection, ASSET_SIZE, tournament);
  const out = new Map<string, { resolved: boolean }>();
  for (const { account } of raw) {
    out.set(new PublicKey(account.data.subarray(40, 72)).toBase58(), { resolved: account.data[88] !== 0 });
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Sends every group as its own transaction, then confirms them all with a
 * shared status poll (one getSignatureStatuses per round instead of a poll
 * per transaction). Returns how many failed — a failed group is simply
 * retried next tick, since each step re-reads on-chain state first.
 */
async function sendAll(connection: Connection, authority: Keypair, groups: TransactionInstruction[][]): Promise<number> {
  if (groups.length === 0) return 0;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  let failed = 0;
  const pending: string[] = [];
  for (const ixs of groups) {
    try {
      const tx = new Transaction({ feePayer: authority.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
      tx.sign(authority);
      pending.push(await connection.sendRawTransaction(tx.serialize()));
    } catch (err) {
      failed++;
      console.error("Settlement tx rejected:", err instanceof Error ? err.message : err);
    }
  }
  for (let attempt = 0; attempt < 6 && pending.length > 0; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { value } = await connection.getSignatureStatuses(pending);
    for (let i = pending.length - 1; i >= 0; i--) {
      const status = value[i];
      if (status?.err) {
        failed++;
        console.error(`Settlement tx ${pending[i]} failed:`, JSON.stringify(status.err));
        pending.splice(i, 1);
      } else if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        pending.splice(i, 1);
      }
    }
  }
  return failed + pending.length;
}

function settleIx(authority: PublicKey, tournament: PublicKey, entry: EntryRow): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: entry.pubkey, isSigner: false, isWritable: true },
      ...entry.picks.map((mint) => ({
        pubkey: PublicKey.findProgramAddressSync([ASSET_SEED, tournament.toBuffer(), mint.toBuffer()], PROGRAM_ID)[0],
        isSigner: false,
        isWritable: false,
      })),
    ],
    data: Buffer.from(SETTLE_DISC),
  });
}

// constants::RAKE_BPS — the platform's cut of every pool.
const RAKE_BPS = 500;

// finalize_tournament(winners_count, threshold_score_bps, fee_bps): fee_bps is the whole cut
// taken off the pool — the rake alone, or rake + the creator's cut for a player-made tournament.
function finalizeIx(
  authority: PublicKey,
  tournament: PublicKey,
  winners: number,
  thresholdBps: number,
  feeBps: number,
): TransactionInstruction {
  const args = Buffer.alloc(10);
  args.writeUInt32LE(winners, 0);
  args.writeInt32LE(thresholdBps, 4);
  args.writeUInt16LE(feeBps, 8);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: true },
    ],
    data: concatBytes(FINALIZE_DISC, args),
  });
}

function withdrawFeesIx(
  authority: PublicKey,
  tournament: PublicKey,
  vault: PublicKey,
  creator: PublicKey,
  creatorLamports: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concatBytes(WITHDRAW_FEES_DISC, u64le(creatorLamports)),
  });
}

/**
 * Once every prize is paid, moves what finalize held back out of the vault: the
 * creator's cut to the creator (player-made tournaments only) and the rest of the
 * fees to the authority wallet. Reads the tournament fresh (finalize may have just
 * changed it) and only sends when there is something to take, so it is safe to
 * call again — a second call finds nothing.
 */
async function withdrawFees(
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
  vault: PublicKey,
  creator: string | undefined,
): Promise<{ ok: boolean; note: string }> {
  const info = await connection.getAccountInfo(tournament);
  if (!info) return { ok: true, note: "" };
  const v = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
  const pool = v.getBigUint64(82, true);
  const distributed = v.getBigUint64(99, true);
  const rentMinimum = BigInt(await connection.getMinimumBalanceForRentExemption(0));
  const totalFees = pool > distributed ? pool - distributed : 0n;
  const spendable = totalFees > rentMinimum ? totalFees - rentMinimum : 0n;
  if (spendable === 0n) return { ok: true, note: "" };

  // Mirrors the program: the creator's cap is what the fees hold above the platform's own rake.
  const platformRake = (pool * BigInt(RAKE_BPS)) / 10_000n;
  let creatorLamports = 0n;
  if (creator) {
    const cap = totalFees > platformRake ? totalFees - platformRake : 0n;
    creatorLamports = cap < spendable ? cap : spendable;
  }
  const creatorKey = creator ? new PublicKey(creator) : authority.publicKey;
  const failed = await sendAll(connection, authority, [
    [withdrawFeesIx(authority.publicKey, tournament, vault, creatorKey, creatorLamports)],
  ]);
  if (failed > 0) return { ok: false, note: "fee withdrawal failed, retrying" };
  return { ok: true, note: `fees withdrawn (creator ${creatorLamports} lamports)` };
}

function closeEntryIx(authority: PublicKey, tournament: PublicKey, entry: EntryRow): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: entry.pubkey, isSigner: false, isWritable: true },
      { pubkey: entry.player, isSigner: false, isWritable: true }, // the entry's rent goes back to the player
    ],
    data: Buffer.from(CLOSE_ENTRY_DISC),
  });
}

function closeAssetIx(authority: PublicKey, tournament: PublicKey, asset: AssetRow): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: asset.pubkey, isSigner: false, isWritable: true },
      { pubkey: asset.payer, isSigner: false, isWritable: true }, // back to whoever paid it
    ],
    data: Buffer.from(CLOSE_ASSET_PRICE_DISC),
  });
}

function closeTournamentIx(authority: PublicKey, tournament: PublicKey, vault: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: tournament, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(CLOSE_TOURNAMENT_DISC),
  });
}

const CLOSES_PER_TX = 6;
const MAX_CLOSE_TX_PER_STEP = 40; // 240 accounts per tick, per tournament

/** The full, off-chain copy of a tournament's standings — written before anything is closed (see archive.ts). */
function buildArchive(tdata: Uint8Array, entries: EntryRow[], assets: AssetRow[]): ArchivedResult {
  const v = new DataView(tdata.buffer, tdata.byteOffset, tdata.byteLength);
  const status = v.getUint8(90);
  const winners = v.getUint32(91, true);
  const threshold = v.getInt32(95, true);
  const distributed = v.getBigUint64(99, true);
  const share = status === TOURNAMENT_FINALIZED && winners > 0 ? distributed / BigInt(winners) : 0n;
  return {
    tournament: {
      id: v.getBigUint64(40, true).toString(),
      status: status === TOURNAMENT_CANCELLED ? "cancelled" : "finalized",
      authority: new PublicKey(tdata.subarray(8, 40)).toBase58(),
      entryFeeLamports: v.getBigUint64(48, true).toString(),
      startTs: Number(v.getBigInt64(56, true)),
      endTs: Number(v.getBigInt64(64, true)),
      entryMode: v.getUint8(107) === 0 ? "single" : "multiple",
      guaranteedAmountLamports: v.getBigUint64(108, true).toString(),
      prizePoolLamports: v.getBigUint64(82, true).toString(),
      distributedPoolLamports: distributed.toString(),
      winnersCount: winners,
      thresholdScoreBps: threshold,
      entryCount: v.getUint32(74, true),
      assetCount: v.getUint16(72, true),
    },
    entries: entries.map((e) => ({
      player: e.player.toBase58(),
      entryIndex: e.entryIndex,
      picks: e.picks.map((p) => p.toBase58()),
      fpSpent: e.fpSpent,
      scoreBps: e.scoreBps,
      createdAt: e.createdAt,
      prizeLamports: (e.settled && e.scoreBps >= threshold ? share : 0n).toString(),
    })),
    assets: assets.map((a) => ({
      mint: a.mint.toBase58(),
      startPriceMicros: a.startMicros.toString(),
      endPriceMicros: a.endMicros.toString(),
    })),
  };
}

/**
 * The last chapter of a tournament: keep the results, then give every piece of rent back —
 * entries to the players, coin accounts to whoever paid them, the tournament account (and the vault's
 * leftover) to us. Order matters (the program enforces it): entries, then coins, then the tournament.
 * Each pass does as much as fits and the next tick continues; only closing the tournament ends it.
 */
async function closeOut(
  env: Env,
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
): Promise<StepResult> {
  const info = await connection.getAccountInfo(tournament);
  if (!info) return { note: "closed", done: true, progressed: false };
  const tdata = info.data;
  const v = new DataView(tdata.buffer, tdata.byteOffset, tdata.byteLength);
  const status = v.getUint8(90);
  const threshold = v.getInt32(95, true);

  const entries = await readEntries(connection, tournament);
  const assets = await readAssetRows(connection, tournament);

  // Results first: once the first entry is closed the standings are no longer on chain.
  const id = v.getBigUint64(40, true).toString();
  if (!(await hasResult(env, id))) await saveResult(env, buildArchive(tdata, entries, assets));

  const vault = PublicKey.findProgramAddressSync([VAULT_SEED, tournament.toBuffer()], PROGRAM_ID)[0];
  if (entries.length > 0) {
    // (a cancelled tournament's entries are closed by their refunds, in refundAll)
    const closable =
      status === TOURNAMENT_FINALIZED ? entries.filter((e) => e.settled && (e.claimed || e.scoreBps < threshold)) : [];
    if (closable.length === 0) return { note: `${entries.length} entr(ies) can't be closed yet`, done: false, progressed: false };
    const batch = closable.slice(0, CLOSES_PER_TX * MAX_CLOSE_TX_PER_STEP);
    const groups = chunk(batch, CLOSES_PER_TX).map((g) => g.map((e) => closeEntryIx(authority.publicKey, tournament, e)));
    const failed = await sendAll(connection, authority, groups);
    return {
      note: `closed ${batch.length}/${entries.length} entr(ies)${failed ? `, ${failed} tx failed` : ""}`,
      done: false,
      progressed: failed < groups.length,
    };
  }

  if (assets.length > 0) {
    const batch = assets.slice(0, CLOSES_PER_TX * MAX_CLOSE_TX_PER_STEP);
    const groups = chunk(batch, CLOSES_PER_TX).map((g) => g.map((a) => closeAssetIx(authority.publicKey, tournament, a)));
    const failed = await sendAll(connection, authority, groups);
    return {
      note: `closed ${batch.length}/${assets.length} coin account(s)${failed ? `, ${failed} tx failed` : ""}`,
      done: false,
      progressed: failed < groups.length,
    };
  }

  const failed = await sendAll(connection, authority, [[closeTournamentIx(authority.publicKey, tournament, vault)]]);
  return failed === 0
    ? { note: "closed, rent recovered", done: true, progressed: true }
    : { note: "closing the tournament failed, retrying", done: false, progressed: false };
}

function claimIx(authority: PublicKey, tournament: PublicKey, vault: PublicKey, entry: EntryRow): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: entry.pubkey, isSigner: false, isWritable: true },
      { pubkey: entry.player, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(CLAIM_DISC),
  });
}

function cancelIx(authority: PublicKey, tournament: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(CANCEL_DISC),
  });
}

function refundIx(authority: PublicKey, tournament: PublicKey, vault: PublicKey, entry: EntryRow): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: tournament, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: entry.pubkey, isSigner: false, isWritable: true },
      { pubkey: entry.player, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(REFUND_DISC),
  });
}

/** Prize structures a tournament can have. The program itself only knows "equal share for everyone at or above a threshold"; the structure is how many ranks that covers. */
export type Payout = "top1" | "top3" | "p30" | "p50" | "pvp";

/** How many of `n` entrants win (before ties widen the set). Mirrored in the app's liveScore.ts. */
export function winnerTarget(payout: Payout, n: number): number {
  switch (payout) {
    case "top1":
    case "pvp": // a duel: winner takes all (the app keeps a third player out; if one gets in anyway it is simply top 1)
      return 1;
    case "top3":
      return Math.min(3, Math.max(1, n));
    case "p30":
      return Math.max(1, Math.ceil(n * 0.3));
    case "p50":
      return Math.max(1, Math.ceil(n / 2));
  }
}

/**
 * The winners' cut-off. By default the top half of entrants win (player-made
 * tournaments can pick Top 1 / Top 3 / 30%); the program pays
 * every settled entry with score >= threshold an equal share, so
 * `winners_count` MUST equal how many entries clear the threshold (ties at the
 * cut-off all win) or the vault would be paid out more than it holds.
 */
export function winnersFromScores(scores: number[], payout: Payout = "p50"): { winners: number; thresholdBps: number } {
  const sorted = [...scores].sort((a, b) => b - a);
  const target = winnerTarget(payout, sorted.length);
  const thresholdBps = sorted[target - 1];
  return { winners: sorted.filter((s) => s >= thresholdBps).length, thresholdBps };
}

interface StepResult {
  note: string;
  done: boolean;
  /** At least one transaction landed this pass — i.e. the tournament is moving, not stuck. */
  progressed: boolean;
}

const TOURNAMENT_OPEN = 0;
const TOURNAMENT_FINALIZED = 1;
const TOURNAMENT_CANCELLED = 2;

/** Settle every entry whose prices are in, finalize once all are scored, then pay the winners. */
async function settleAndPay(
  env: Env,
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
  tdata: Uint8Array,
  info: SettlementInfo,
): Promise<StepResult> {
  const { payout, creator } = info;
  const view = new DataView(tdata.buffer, tdata.byteOffset, tdata.byteLength);
  const finalized = view.getUint8(90) === TOURNAMENT_FINALIZED;

  let entries = await readEntries(connection, tournament);
  let winners = view.getUint32(91, true);
  let thresholdBps = view.getInt32(95, true);
  let progressed = false;

  if (!finalized) {
    const assets = await readAssets(connection, tournament);
    const unsettled = entries.filter((e) => !e.settled);
    if (unsettled.length > 0) {
      const ready = unsettled.filter((e) => e.picks.every((p) => assets.get(p.toBase58())?.resolved));
      if (ready.length === 0) return { note: "waiting for end prices", done: false, progressed };
      const batch = ready.slice(0, SETTLES_PER_TX * MAX_TX_PER_STEP);
      const groups = chunk(batch, SETTLES_PER_TX).map((g) => g.map((e) => settleIx(authority.publicKey, tournament, e)));
      const failed = await sendAll(connection, authority, groups);
      progressed = failed < groups.length;
      if (failed > 0 || batch.length < unsettled.length) {
        return {
          note: `settled ${batch.length} (${failed} tx failed), ${unsettled.length - batch.length} left`,
          done: false,
          progressed,
        };
      }
      entries = await readEntries(connection, tournament); // scores now come from chain, not from our own math
    }

    if (entries.some((e) => !e.settled)) return { note: "entries still settling", done: false, progressed };
    ({ winners, thresholdBps } = winnersFromScores(entries.map((e) => e.scoreBps), payout));
    const feeBps = creator ? RAKE_BPS + CREATOR_FEE_BPS : RAKE_BPS; // winners share 90% when the creator earns a cut
    const failed = await sendAll(connection, authority, [[finalizeIx(authority.publicKey, tournament, winners, thresholdBps, feeBps)]]);
    if (failed > 0) return { note: "finalize failed, retrying next tick", done: false, progressed };
    progressed = true;
  }

  const vault = PublicKey.findProgramAddressSync([VAULT_SEED, tournament.toBuffer()], PROGRAM_ID)[0];
  const claimable = entries.filter((e) => e.settled && !e.claimed && e.scoreBps >= thresholdBps);
  if (claimable.length === 0) {
    // Every prize is out: now the fees can leave the vault (to the creator and to us).
    const fees = await withdrawFees(connection, authority, tournament, vault, creator);
    const feeNote = `finalized (${winners} winner(s)), all paid${fees.note ? `; ${fees.note}` : ""}`;
    const feeProgress = progressed || fees.note.startsWith("fees withdrawn");
    if (!fees.ok) return { note: feeNote, done: false, progressed: feeProgress };
    // Then tidy up: results are archived and all the rent goes back (closeOut).
    const closing = await closeOut(env, connection, authority, tournament);
    return { note: `${feeNote}; ${closing.note}`, done: closing.done, progressed: feeProgress || closing.progressed };
  }

  const batch = claimable.slice(0, CLAIMS_PER_TX * MAX_TX_PER_STEP);
  const groups = chunk(batch, CLAIMS_PER_TX).map((g) => g.map((e) => claimIx(authority.publicKey, tournament, vault, e)));
  const failed = await sendAll(connection, authority, groups);
  // Not done yet even when every claim went through: the next pass finds nothing left to claim,
  // and only then withdraws the fees (creator's cut + ours) — so this tournament is revisited once more.
  const note = failed === 0 ? `paid ${batch.length}/${claimable.length} winner(s)` : `claims: ${failed} tx failed, retrying`;
  return { note, done: false, progressed: progressed || failed < groups.length };
}

/**
 * A cancelled tournament pays nobody: return every entry's fee (and the
 * entry account's rent — refund_entry closes it). Refunded entries no longer
 * exist, so what's left on chain is exactly what's still owed.
 */
async function refundAll(connection: Connection, authority: Keypair, tournament: PublicKey): Promise<StepResult> {
  const entries = await readEntries(connection, tournament);
  const owed = entries.filter((e) => !e.claimed);
  if (owed.length === 0) return { note: "cancelled, all entries refunded", done: true, progressed: false };

  const vault = PublicKey.findProgramAddressSync([VAULT_SEED, tournament.toBuffer()], PROGRAM_ID)[0];
  const batch = owed.slice(0, CLAIMS_PER_TX * MAX_TX_PER_STEP);
  const groups = chunk(batch, CLAIMS_PER_TX).map((g) => g.map((e) => refundIx(authority.publicKey, tournament, vault, e)));
  const failed = await sendAll(connection, authority, groups);
  const done = failed === 0 && batch.length === owed.length;
  return {
    note: failed === 0 ? `refunded ${batch.length}/${owed.length} entr(ies)` : `refunds: ${failed} tx failed, retrying`,
    done,
    progressed: failed < groups.length,
  };
}

async function processTournament(
  env: Env,
  connection: Connection,
  authority: Keypair,
  tournament: PublicKey,
  tdata: Uint8Array,
  pricesReady: boolean,
  nowSec: number,
  info: SettlementInfo,
): Promise<StepResult> {
  const view = new DataView(tdata.buffer, tdata.byteOffset, tdata.byteLength);
  const status = view.getUint8(90);
  if (status === TOURNAMENT_CANCELLED) {
    const refunds = await refundAll(connection, authority, tournament);
    if (!refunds.done) return refunds;
    const closing = await closeOut(env, connection, authority, tournament); // coin accounts + the tournament
    return { note: `${refunds.note}; ${closing.note}`, done: closing.done, progressed: refunds.progressed || closing.progressed };
  }

  const endTs = Number(view.getBigInt64(64, true));
  const result: StepResult = pricesReady
    ? await settleAndPay(env, connection, authority, tournament, tdata, info)
    : { note: "waiting for end prices", done: false, progressed: false };
  if (result.done || result.progressed || status !== TOURNAMENT_OPEN) return result;

  // Not finished, and nothing moved this pass. Until the grace period is over
  // a missing price is just retried (history doesn't expire); after it, the
  // safe way out is to cancel and give everyone their fee back — the
  // alternative is fees locked in the vault forever.
  if (nowSec < endTs + CANCEL_GRACE_SECONDS) return result;
  const failed = await sendAll(connection, authority, [[cancelIx(authority.publicKey, tournament)]]);
  return failed === 0
    ? { note: `${result.note} — stuck past the grace period, CANCELLED (refunds next)`, done: false, progressed: true }
    : { note: `${result.note} — cancel rejected (probably already fully settled), retrying`, done: false, progressed: false };
}

/**
 * Runs after syncPrices in the same tick, on the same candidate list (see
 * findCandidates). A tournament is only worked on once its end prices are all
 * on-chain (states[id].end), so waiting ticks cost nothing; once paid out it's
 * flagged `settled` in KV and never read again.
 */
export async function settleTournaments(
  env: Env,
  connection: Connection,
  candidates: Candidate[],
  states: TournamentStates,
): Promise<string> {
  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const nowSec = Math.floor(Date.now() / 1000);
  const infos = await getSettlementInfo(env); // player-made tournaments: prize structure + creator cut

  const notes: string[] = [];
  const empty: Candidate[] = [];
  for (const c of candidates) {
    const view = new DataView(c.data.buffer, c.data.byteOffset, c.data.byteLength);
    const id = view.getBigUint64(40, true).toString();
    const entryCount = view.getUint32(74, true);
    const assetCount = view.getUint16(72, true);
    if (entryCount === 0 && assetCount === 0) {
      // Nobody entered: nothing to settle, refund or show — the only job left is getting the rent back.
      // (Once closed the account is gone, so it stops being a candidate; no flag needed.)
      if (nowSec >= Number(view.getBigInt64(56, true))) empty.push(c);
      continue;
    }
    const st = (states[id] ??= {});
    if (st.settled) continue;
    const status = view.getUint8(90);
    const endTs = Number(view.getBigInt64(64, true));

    const cancelled = status === TOURNAMENT_CANCELLED;
    if (!cancelled && nowSec < endTs) continue; // still running
    // Normally wait for every end price; but a tournament whose prices never
    // arrive must still reach the cancel/refund check once its grace period is over.
    const pastGrace = nowSec >= endTs + CANCEL_GRACE_SECONDS;
    if (!st.end && !pastGrace && !cancelled) continue;

    try {

      const r = await processTournament(env, connection, authority, c.pubkey, c.data, !!st.end, nowSec, infos[id] ?? { payout: "p50" });
      notes.push(`${id}: ${r.note}`);
      if (r.done) st.settled = true;
    } catch (err) {
      notes.push(`${id}: error ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (empty.length > 0) {
    try {
      const groups = chunk(empty, CLOSES_PER_TX).map((g) =>
        g.map((c) =>
          closeTournamentIx(
            authority.publicKey,
            c.pubkey,
            PublicKey.findProgramAddressSync([VAULT_SEED, c.pubkey.toBuffer()], PROGRAM_ID)[0],
          ),
        ),
      );
      const failed = await sendAll(connection, authority, groups);
      notes.push(`closed ${empty.length} empty tournament(s) to recover their rent${failed ? ` (${failed} tx failed)` : ""}`);
    } catch (err) {
      notes.push(`closing empty tournaments failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return `${candidates.length} candidate tournament(s)${notes.length ? ": " + notes.join("; ") : ""}`;
}

