import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "../utils/ConnectionProvider";
import {
  TOURNAMENT_DISCRIMINATOR,
  TOURNAMENT_ASSET_DISCRIMINATOR,
  ENTRY_DISCRIMINATOR,
  decodeTournament,
  decodeTournamentAsset,
  decodeEntry,
  type TournamentAccount,
  type TournamentAssetAccount,
  type EntryAccount,
} from "./accounts";
import { fetchAllAccountsV2, fetchOneAccount } from "./gpaV2";
import { PROGRAM_ID } from "./config";
import { tournamentPda, entryPda } from "./pdas";

export type { TournamentAccount, TournamentAssetAccount, EntryAccount };

// Lobby: every Tournament account, newest id first. Cheap to poll — this is
// the only screen that lists an unbounded/growing account set, everything
// else reads a single known PDA or scopes with a memcmp filter.
export function useTournaments() {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["tournaments"],
    queryFn: async () => {
      const rows = await fetchAllAccountsV2(connection, PROGRAM_ID, TOURNAMENT_DISCRIMINATOR, decodeTournament);
      return rows.sort((a, b) => Number(b.account.id - a.account.id));
    },
    refetchInterval: 20_000,
  });
}

export function useTournament(id: bigint | number | null) {
  const { connection } = useConnection();
  const pda = id == null ? null : tournamentPda(id)[0];

  return useQuery({
    queryKey: ["tournament", pda?.toBase58()],
    queryFn: () => fetchOneAccount(connection, pda!, decodeTournament),
    enabled: !!pda,
    refetchInterval: 10_000,
  });
}

// Byte offset of TournamentAsset::tournament within its raw account data:
// 8 (discriminator) + 0 (tournament is the first field) = 8.
const ASSET_TOURNAMENT_OFFSET = 8;

export function useTournamentAssets(tournament: PublicKey | null) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["tournament-assets", tournament?.toBase58()],
    queryFn: () =>
      fetchAllAccountsV2(connection, PROGRAM_ID, TOURNAMENT_ASSET_DISCRIMINATOR, decodeTournamentAsset, [
        { memcmp: { offset: ASSET_TOURNAMENT_OFFSET, bytes: bs58.encode(tournament!.toBuffer()) } },
      ]),
    enabled: !!tournament,
    refetchInterval: 15_000,
  });
}

// Single mode: the one entry a wallet can ever have in this tournament,
// always at index 0.
export function useMyEntry(tournament: PublicKey | null, player: PublicKey | null) {
  const { connection } = useConnection();
  const pda = tournament && player ? entryPda(tournament, player, 0)[0] : null;

  return useQuery({
    queryKey: ["entry", pda?.toBase58()],
    queryFn: () => fetchOneAccount(connection, pda!, decodeEntry),
    enabled: !!pda,
    refetchInterval: 10_000,
  });
}

// Byte offsets of Entry::tournament / Entry::player within its raw data —
// 8 (discriminator) + 0, and +32 for player right after it.
const ENTRY_TOURNAMENT_OFFSET = 8;
const ENTRY_PLAYER_OFFSET = 40;

// Multiple mode: every entry this wallet holds in this tournament, however
// many there are.
export function useMyEntries(tournament: PublicKey | null, player: PublicKey | null) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["entries", tournament?.toBase58(), player?.toBase58()],
    queryFn: async () => {
      const rows = await fetchAllAccountsV2(connection, PROGRAM_ID, ENTRY_DISCRIMINATOR, decodeEntry, [
        { memcmp: { offset: ENTRY_TOURNAMENT_OFFSET, bytes: bs58.encode(tournament!.toBuffer()) } },
        { memcmp: { offset: ENTRY_PLAYER_OFFSET, bytes: bs58.encode(player!.toBuffer()) } },
      ]);
      return rows.sort((a, b) => a.account.entryIndex - b.account.entryIndex);
    },
    enabled: !!tournament && !!player,
    refetchInterval: 10_000,
  });
}

// Every tournament (by its PDA, as a base58 string) this wallet has at
// least one entry in, across the whole program — one cheap query for the
// Lobby/Live/Results cards to know "have I already entered this one" so a
// Single-mode card can swap its red entry-fee chip for a plain "View" once
// you're in, instead of re-fetching per card.
export function useMyEnteredTournaments(player: PublicKey | null) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["my-entered-tournaments", player?.toBase58()],
    queryFn: async () => {
      const rows = await fetchAllAccountsV2(connection, PROGRAM_ID, ENTRY_DISCRIMINATOR, decodeEntry, [
        { memcmp: { offset: ENTRY_PLAYER_OFFSET, bytes: bs58.encode(player!.toBuffer()) } },
      ]);
      return new Set(rows.map((r) => r.account.tournament.toBase58()));
    },
    enabled: !!player,
    refetchInterval: 15_000,
  });
}
