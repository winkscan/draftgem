import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./config";

// Mirrors the seed constants in programs/pumpfantasy/src/constants.rs.
const TOURNAMENT_SEED = Buffer.from("tournament");
const VAULT_SEED = Buffer.from("vault");
const ASSET_SEED = Buffer.from("asset");
const ENTRY_SEED = Buffer.from("entry");

function u64le(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function u16le(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

export function tournamentPda(id: bigint | number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TOURNAMENT_SEED, u64le(id)], PROGRAM_ID);
}

export function vaultPda(tournament: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, tournament.toBuffer()], PROGRAM_ID);
}

export function assetPda(tournament: PublicKey, mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ASSET_SEED, tournament.toBuffer(), mint.toBuffer()],
    PROGRAM_ID,
  );
}

export function entryPda(tournament: PublicKey, player: PublicKey, entryIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ENTRY_SEED, tournament.toBuffer(), player.toBuffer(), u16le(entryIndex)],
    PROGRAM_ID,
  );
}
