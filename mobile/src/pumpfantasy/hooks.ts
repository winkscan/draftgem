import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchArchivedList, fetchArchivedResult, toAssetRows, toEntryRows, toTournamentAccount } from "./archive";
import { useConnection } from "../utils/ConnectionProvider";
import {
  TOURNAMENT_DISCRIMINATOR,
  ASSET_PRICE_DISCRIMINATOR,
  ENTRY_DISCRIMINATOR,
  decodeTournament,
  decodeAssetPrice,
  decodeEntry,
  type TournamentAccount,
  type AssetPriceAccount,
  type EntryAccount,
} from "./accounts";
import { fetchAllAccountsV2, fetchOneAccount } from "./gpaV2";
import { PROGRAM_ID } from "./config";
import { tournamentPda, entryPda } from "./pdas";

export type { TournamentAccount, AssetPriceAccount, EntryAccount };

// Lobby: every Tournament account, newest id first. Cheap to poll — this is
// the only screen that lists an unbounded/growing account set, everything
// else reads a single known PDA or scopes with a memcmp filter.
export function useTournaments() {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["tournaments"],
    queryFn: async () => {
      // Finished tournaments are closed on chain (to recover the rent) and kept in the worker's archive.
      const [rows, archived] = await Promise.all([
        fetchAllAccountsV2(connection, PROGRAM_ID, TOURNAMENT_DISCRIMINATOR, decodeTournament),
        fetchArchivedList(),
      ]);
      const onChain = new Set(rows.map((r) => r.account.id.toString()));
      const closed = archived
        .filter((a) => !onChain.has(a.id))
        .map((a) => ({ publicKey: tournamentPda(BigInt(a.id))[0], account: toTournamentAccount(a) }));
      return [...rows, ...closed].sort((a, b) => Number(b.account.id - a.account.id));
    },
    refetchInterval: 20_000,
  });
}

export function useTournament(id: bigint | number | null) {
  const { connection } = useConnection();
  const pda = id == null ? null : tournamentPda(id)[0];

  return useQuery({
    queryKey: ["tournament", pda?.toBase58()],
    queryFn: async () => {
      const onChain = await fetchOneAccount(connection, pda!, decodeTournament);
      if (onChain) return onChain;
      const archived = await fetchArchivedResult(id!.toString()); // closed after it finished
      return archived ? toTournamentAccount(archived.tournament) : null;
    },
    enabled: !!pda,
    refetchInterval: 10_000,
  });
}

/** True for a tournament rebuilt from the archive (no on-chain account behind it). */
export const isArchivedTournament = (t: TournamentAccount | null | undefined) => !!t && t.bump === 0 && t.vaultBump === 0;

// Byte offset of AssetPrice::tournament within its raw account data:
// 8 (discriminator) + 0 (tournament is the first field) = 8.
const ASSET_TOURNAMENT_OFFSET = 8;

// Registered lazily, post-start_ts, only for mints someone actually picked
// (see register_asset_price.rs) — so this can be an empty list right up
// until a tournament's entry window locks, and that's expected, not a bug.
export function useAssetPrices(tournament: PublicKey | null, archivedId: bigint | null = null) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["asset-prices", tournament?.toBase58(), archivedId?.toString()],
    queryFn: async () => {
      // A finished tournament's coin accounts are closed; its prices are in the archive.
      if (archivedId != null) {
        const archived = await fetchArchivedResult(archivedId.toString());
        if (archived) return toAssetRows(archived);
      }
      return fetchAllAccountsV2(connection, PROGRAM_ID, ASSET_PRICE_DISCRIMINATOR, decodeAssetPrice, [
        { memcmp: { offset: ASSET_TOURNAMENT_OFFSET, bytes: bs58.encode(tournament!.toBuffer()) } },
      ]);
    },
    enabled: !!tournament,
    refetchInterval: archivedId != null ? false : 15_000,
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
export function useMyEntries(tournament: PublicKey | null, player: PublicKey | null, archivedId: bigint | null = null) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["entries", tournament?.toBase58(), player?.toBase58(), archivedId?.toString()],
    queryFn: async () => {
      // A finished tournament's entries are closed on chain; look this wallet up in the archive instead.
      if (archivedId != null) {
        const archived = await fetchArchivedResult(archivedId.toString());
        if (archived) {
          const me = player!.toBase58();
          return toEntryRows(archived)
            .filter((r) => r.account.player.toBase58() === me)
            .sort((a, b) => a.account.entryIndex - b.account.entryIndex);
        }
      }
      const rows = await fetchAllAccountsV2(connection, PROGRAM_ID, ENTRY_DISCRIMINATOR, decodeEntry, [
        { memcmp: { offset: ENTRY_TOURNAMENT_OFFSET, bytes: bs58.encode(tournament!.toBuffer()) } },
        { memcmp: { offset: ENTRY_PLAYER_OFFSET, bytes: bs58.encode(player!.toBuffer()) } },
      ]);
      return rows.sort((a, b) => a.account.entryIndex - b.account.entryIndex);
    },
    enabled: !!tournament && !!player,
    refetchInterval: archivedId != null ? false : 10_000,
  });
}

// Every entry in a tournament, from every player — the Live leaderboard's
// data source. Refetched fairly often since standings should visibly move
// while a round is live, but this is still just an account-list poll, not
// a price feed — price movement itself comes from useLivePrices.
export function useTournamentEntries(tournament: PublicKey | null, archivedId: bigint | null = null) {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["tournament-entries", tournament?.toBase58(), archivedId?.toString()],
    queryFn: async () => {
      // A finished tournament's entries are closed (each player got their rent back); the standings are archived.
      if (archivedId != null) {
        const archived = await fetchArchivedResult(archivedId.toString());
        if (archived) return toEntryRows(archived);
      }
      return fetchAllAccountsV2(connection, PROGRAM_ID, ENTRY_DISCRIMINATOR, decodeEntry, [
        { memcmp: { offset: ENTRY_TOURNAMENT_OFFSET, bytes: bs58.encode(tournament!.toBuffer()) } },
      ]);
    },
    enabled: !!tournament,
    refetchInterval: archivedId != null ? false : 20_000,
  });
}

// Every tournament (by its PDA, as a base58 string) this wallet has at
// least one entry in, across the whole program — one cheap query for the
// Lobby/Live/Results cards to know "have I already entered this one" so a
// Single-mode card can swap its red entry-fee chip for a plain "View" once
// you're in, instead of re-fetching per card.
export function useMyEnteredTournaments(player: PublicKey | null) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["my-entered-tournaments", player?.toBase58()],
    queryFn: async () => {
      const rows = await fetchAllAccountsV2(connection, PROGRAM_ID, ENTRY_DISCRIMINATOR, decodeEntry, [
        { memcmp: { offset: ENTRY_PLAYER_OFFSET, bytes: bs58.encode(player!.toBuffer()) } },
      ]);
      const entered = new Set(rows.map((r) => r.account.tournament.toBase58()));

      // Finished tournaments no longer have entry accounts: look for this wallet in the newest
      // archived results. Those never change, so each is downloaded once and then cached.
      const me = player!.toBase58();
      const recent = (await fetchArchivedList()).slice(0, 30);
      await Promise.all(
        recent.map(async (t) => {
          try {
            const result = await queryClient.fetchQuery({
              queryKey: ["archived-result", t.id],
              queryFn: () => fetchArchivedResult(t.id),
              staleTime: Infinity,
            });
            if (result?.entries.some((e) => e.player === me)) entered.add(tournamentPda(BigInt(t.id))[0].toBase58());
          } catch {
            // try again on the next refresh
          }
        }),
      );
      return entered;
    },
    enabled: !!player,
    refetchInterval: 15_000,
  });
}
