import { PublicKey } from "@solana/web3.js";
import { PICKS_PER_ENTRY } from "./config";
import { BinaryReader } from "./binary";

// Discriminator bytes copied verbatim from idl/pumpfantasy.json's
// "accounts" section — see binary.ts for why these are hardcoded instead of
// computed at runtime via Anchor's coder.
export const TOURNAMENT_DISCRIMINATOR = Buffer.from([175, 139, 119, 242, 115, 194, 57, 92]);
export const ASSET_PRICE_DISCRIMINATOR = Buffer.from([197, 106, 216, 207, 155, 172, 40, 245]);
export const ENTRY_DISCRIMINATOR = Buffer.from([63, 18, 152, 113, 215, 246, 221, 250]);

export type TournamentStatus = "open" | "finalized" | "cancelled";
export type EntryMode = "single" | "multiple";

export interface TournamentAccount {
  authority: PublicKey;
  id: bigint;
  entryFeeLamports: bigint;
  startTs: bigint;
  endTs: bigint;
  assetCount: number;
  entryCount: number;
  settledCount: number;
  prizePoolLamports: bigint;
  status: TournamentStatus;
  winnersCount: number;
  thresholdScoreBps: number;
  distributedPoolLamports: bigint;
  entryMode: EntryMode;
  guaranteedAmountLamports: bigint;
  vaultBump: number;
  bump: number;
  /** Running total of every set_prize call so far — never exceeds distributedPoolLamports. */
  prizesAssignedLamports: bigint;
  /** Set once by finish_prizes; claim_prize and close_entry both require it. */
  prizesFinalized: boolean;
  /** PublicKey.default() = native SOL; any other value is the SPL mint this tournament runs in. */
  mint: PublicKey;
}

// Mirrors Tournament in programs/pumpfantasy/src/state.rs, field for field.
export function decodeTournament(data: Buffer): TournamentAccount {
  const r = new BinaryReader(data).skipDiscriminator();
  return {
    authority: r.readPubkey(),
    id: r.readU64(),
    entryFeeLamports: r.readU64(),
    startTs: r.readI64(),
    endTs: r.readI64(),
    assetCount: r.readU16(),
    entryCount: r.readU32(),
    settledCount: r.readU32(),
    prizePoolLamports: r.readU64(),
    status: (["open", "finalized", "cancelled"] as const)[r.readEnumTag()] ?? "open",
    winnersCount: r.readU32(),
    thresholdScoreBps: r.readI32(),
    distributedPoolLamports: r.readU64(),
    entryMode: r.readEnumTag() === 0 ? "single" : "multiple",
    guaranteedAmountLamports: r.readU64(),
    vaultBump: r.readU8(),
    bump: r.readU8(),
    prizesAssignedLamports: r.readU64(),
    prizesFinalized: r.readBool(),
    mint: r.readPubkey(),
  };
}

// One shared start/end price per (tournament, mint) — no fpCost here
// anymore. Budget is no longer enforced by looking up a pre-registered
// on-chain asset; it's attested off-chain per-pick and verified on-chain at
// `enter_tournament` time (see actions.ts's enterTournament). This account
// only ever answers "what did this mint do between start and end".
export interface AssetPriceAccount {
  tournament: PublicKey;
  mint: PublicKey;
  startPriceMicros: bigint;
  endPriceMicros: bigint;
  resolved: boolean;
  bump: number;
}

export function decodeAssetPrice(data: Buffer): AssetPriceAccount {
  const r = new BinaryReader(data).skipDiscriminator();
  return {
    tournament: r.readPubkey(),
    mint: r.readPubkey(),
    startPriceMicros: r.readU64(),
    endPriceMicros: r.readU64(),
    resolved: r.readBool(),
    bump: r.readU8(),
  };
}

export interface EntryAccount {
  tournament: PublicKey;
  player: PublicKey;
  entryIndex: number;
  // Raw mint addresses — NOT references to a pre-registered asset account.
  picks: PublicKey[];
  fpSpent: number;
  scoreBps: number;
  settled: boolean;
  claimed: boolean;
  // Tiebreaker when two entries land on the exact same scoreBps: the
  // earlier createdAt ranks higher (see state.rs's own comment).
  createdAt: bigint;
  bump: number;
  /** Set by set_prize once the tournament finalizes and its prize plan is written — 0 until then, or if it didn't place. */
  prizeLamports: bigint;
}

export function decodeEntry(data: Buffer): EntryAccount {
  const r = new BinaryReader(data).skipDiscriminator();
  const tournament = r.readPubkey();
  const player = r.readPubkey();
  const entryIndex = r.readU16();
  const picks: PublicKey[] = [];
  for (let i = 0; i < PICKS_PER_ENTRY; i++) picks.push(r.readPubkey());
  return {
    tournament,
    player,
    entryIndex,
    picks,
    fpSpent: r.readU32(),
    scoreBps: r.readI32(),
    settled: r.readBool(),
    claimed: r.readBool(),
    createdAt: r.readI64(),
    bump: r.readU8(),
    prizeLamports: r.readU64(),
  };
}
