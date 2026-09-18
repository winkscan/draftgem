import { PublicKey } from "@solana/web3.js";
import { PICKS_PER_ENTRY } from "./config";
import { BinaryReader } from "./binary";

// Discriminator bytes copied verbatim from idl/pumpfantasy.json's
// "accounts" section — see binary.ts for why these are hardcoded instead of
// computed at runtime via Anchor's coder.
export const TOURNAMENT_DISCRIMINATOR = Buffer.from([175, 139, 119, 242, 115, 194, 57, 92]);
export const TOURNAMENT_ASSET_DISCRIMINATOR = Buffer.from([52, 102, 230, 140, 17, 232, 148, 75]);
export const ENTRY_DISCRIMINATOR = Buffer.from([63, 18, 152, 113, 215, 246, 221, 250]);

export type TournamentStatus = "open" | "finalized";
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
    status: r.readEnumTag() === 0 ? "open" : "finalized",
    winnersCount: r.readU32(),
    thresholdScoreBps: r.readI32(),
    distributedPoolLamports: r.readU64(),
    entryMode: r.readEnumTag() === 0 ? "single" : "multiple",
    guaranteedAmountLamports: r.readU64(),
    vaultBump: r.readU8(),
    bump: r.readU8(),
  };
}

export interface TournamentAssetAccount {
  tournament: PublicKey;
  mint: PublicKey;
  fpCost: number;
  startPriceMicros: bigint;
  endPriceMicros: bigint;
  resolved: boolean;
  bump: number;
}

export function decodeTournamentAsset(data: Buffer): TournamentAssetAccount {
  const r = new BinaryReader(data).skipDiscriminator();
  return {
    tournament: r.readPubkey(),
    mint: r.readPubkey(),
    fpCost: r.readU32(),
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
  picks: PublicKey[];
  fpSpent: number;
  scoreBps: number;
  settled: boolean;
  claimed: boolean;
  bump: number;
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
    bump: r.readU8(),
  };
}
