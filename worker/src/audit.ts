import { PublicKey } from "@solana/web3.js";

// Last line of defence before a tournament is finalized and its prize plan written. Finalizing is
// the point of no return (from there set_prize -> finish_prizes -> claim_prize moves real money to
// wallets, and none of it can be recalled), so everything the payout will rely on is re-checked
// here from scratch, independently of the code that produced it. Any failure HOLDS the payout:
// nothing is finalized, the reasons are logged and shown at /held, and — since a held tournament
// makes no progress — the existing safety net cancels it after the grace period and refunds every
// entry fee. So a bad input costs a refund, never a wrong payout.

/** An end/start price ratio beyond this (up or down) is treated as bad data, not a market move. */
const MAX_PRICE_RATIO = 50n;
const BPS = 10_000n;
const SCORE_FLOOR_BPS = -10_000n;
const PICKS = 5;

export interface AuditEntry {
  pubkey: PublicKey;
  player: PublicKey;
  entryIndex: number;
  picks: PublicKey[];
  scoreBps: number;
  settled: boolean;
}

export interface AuditAsset {
  mint: PublicKey;
  startMicros: bigint;
  endMicros: bigint;
}

export interface AuditInput {
  tournament: PublicKey;
  programId: PublicKey;
  /** entry PDA = [b"entry", tournament, player, index_u16_le] */
  entrySeed: Uint8Array;
  entries: AuditEntry[];
  assets: AuditAsset[];
  entryCountOnChain: number;
  entryFee: bigint;
  pool: bigint;
  /** What the vault really holds, in the tournament's own units (lamports, or token base units). */
  vaultBalance: bigint;
  prizes: Map<string, bigint>;
  distributable: bigint;
  feeBps: number;
  creator?: string;
}

/** Returns a list of problems; empty means the payout may proceed. */
export function auditBeforeFinalize(a: AuditInput): string[] {
  const bad: string[] = [];
  const assetByMint = new Map(a.assets.map((x) => [x.mint.toBase58(), x]));

  // 1. Prices: every price present, and no start/end pair that looks like a broken data source.
  for (const x of a.assets) {
    const m = x.mint.toBase58();
    if (x.startMicros <= 0n) bad.push(`${m}: no start price`);
    else if (x.endMicros > x.startMicros * MAX_PRICE_RATIO) bad.push(`${m}: end ${x.endMicros} is over ${MAX_PRICE_RATIO}x start ${x.startMicros}`);
    else if (x.endMicros > 0n && x.endMicros * MAX_PRICE_RATIO < x.startMicros) bad.push(`${m}: end ${x.endMicros} is under 1/${MAX_PRICE_RATIO} of start ${x.startMicros}`);
  }

  // 2. Entries: real (address re-derived), settled, and their on-chain score matches a fresh
  //    recomputation from the prices above.
  if (a.entries.length !== a.entryCountOnChain) bad.push(`read ${a.entries.length} entries but the tournament says ${a.entryCountOnChain}`);
  const seen = new Set<string>();
  for (const e of a.entries) {
    const idx = new Uint8Array(2);
    new DataView(idx.buffer).setUint16(0, e.entryIndex, true);
    const expected = PublicKey.findProgramAddressSync(
      [a.entrySeed, a.tournament.toBytes(), e.player.toBytes(), idx],
      a.programId,
    )[0];
    if (!expected.equals(e.pubkey)) bad.push(`entry ${e.pubkey.toBase58()} is not the PDA for its own player/index`);
    if (seen.has(e.pubkey.toBase58())) bad.push(`entry ${e.pubkey.toBase58()} listed twice`);
    seen.add(e.pubkey.toBase58());
    if (!e.settled) bad.push(`entry ${e.pubkey.toBase58()} is not settled`);
    if (e.picks.length !== PICKS) {
      bad.push(`entry ${e.pubkey.toBase58()} has ${e.picks.length} picks`);
      continue;
    }
    let total = 0n;
    let complete = true;
    for (const p of e.picks) {
      const asset = assetByMint.get(p.toBase58());
      if (!asset || asset.startMicros <= 0n) {
        complete = false;
        break;
      }
      const pct = ((asset.endMicros - asset.startMicros) * BPS) / asset.startMicros;
      total += pct < SCORE_FLOOR_BPS ? SCORE_FLOOR_BPS : pct;
    }
    if (complete && total !== BigInt(e.scoreBps)) bad.push(`entry ${e.pubkey.toBase58()}: on-chain score ${e.scoreBps} != recomputed ${total}`);
  }

  // 3. Money in: the pool is exactly what the entries paid, and the vault really holds it.
  if (a.pool !== a.entryFee * BigInt(a.entryCountOnChain)) bad.push(`pool ${a.pool} != ${a.entryCountOnChain} x fee ${a.entryFee}`);
  // (The vault holds exactly what the entries paid: it has no separate rent reserve on top, so the
  // check is against the pool alone. An earlier version added a reserve and held every payout.)
  if (a.vaultBalance < a.pool) bad.push(`vault holds ${a.vaultBalance}, less than pool ${a.pool}`);

  // 4. Money out: fees + winners' shares can never exceed the pool, every prize goes to a real
  //    entry of this tournament, and the fee split is one of the two the contract allows.
  if (a.feeBps !== 500 && a.feeBps !== 1000) bad.push(`fee ${a.feeBps} bps is not 5% or 10%`);
  if (a.feeBps === 1000 && !a.creator) bad.push("10% fee but no creator to pay the creator's share to");
  if (a.distributable <= 0n || a.distributable > a.pool) bad.push(`distributable ${a.distributable} outside 0..pool ${a.pool}`);
  if (a.distributable !== (a.pool * BigInt(10_000 - a.feeBps)) / 10_000n) bad.push("distributable does not match pool minus fees");
  let paid = 0n;
  for (const [entryKey, amount] of a.prizes) {
    if (!seen.has(entryKey)) bad.push(`prize for ${entryKey}, which is not an entry of this tournament`);
    if (amount <= 0n) bad.push(`non-positive prize for ${entryKey}`);
    paid += amount;
  }
  if (paid > a.distributable) bad.push(`prizes total ${paid}, above the distributable ${a.distributable}`);
  if (a.prizes.size === 0 && a.entries.length > 0) bad.push("no winners at all from a non-empty tournament");
  if (a.prizes.size > a.entries.length) bad.push("more winners than entries");

  return bad;
}
