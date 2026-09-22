import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { WORKER_URL } from "./config";
import { assetPda, entryPda, tournamentPda } from "./pdas";
import type { AssetPriceAccount, EntryAccount, TournamentAccount } from "./accounts";

// Finished tournaments live here, not on chain: once one is over, the worker closes its
// accounts to recover the rent (entries go back to the players, coin accounts to whoever paid
// them, the tournament to the platform) and keeps the standings in this archive
// (worker/src/archive.ts). These helpers turn an archive record back into the same shapes the
// on-chain accounts decode to, so the Results list and the Standings screen work unchanged.

export interface ArchivedTournament {
  id: string;
  status: "finalized" | "cancelled";
  authority: string;
  /** Absent on archives from before multi-currency support (= native SOL). */
  mint?: string;
  entryFeeLamports: string;
  startTs: number;
  endTs: number;
  entryMode: "single" | "multiple";
  guaranteedAmountLamports: string;
  prizePoolLamports: string;
  distributedPoolLamports: string;
  winnersCount: number;
  thresholdScoreBps: number;
  entryCount: number;
  assetCount: number;
}

export interface ArchivedEntry {
  player: string;
  entryIndex: number;
  picks: string[];
  fpSpent: number;
  scoreBps: number;
  createdAt: number;
  prizeLamports: string;
}

export interface ArchivedAsset {
  mint: string;
  startPriceMicros: string;
  endPriceMicros: string;
}

export interface ArchivedResult {
  tournament: ArchivedTournament;
  entries: ArchivedEntry[];
  assets: ArchivedAsset[];
}

export async function fetchArchivedList(): Promise<ArchivedTournament[]> {
  try {
    const res = await fetch(`${WORKER_URL}/results`);
    if (!res.ok) return [];
    return ((await res.json()) as { results: ArchivedTournament[] }).results ?? [];
  } catch {
    return []; // the archive is a nice-to-have on top of the chain: never break the lists over it
  }
}

/** null = there is no archive for this tournament (yet); a network/server failure throws instead, so it isn't cached as "none". */
export async function fetchArchivedResult(id: string): Promise<ArchivedResult | null> {
  const res = await fetch(`${WORKER_URL}/results/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Archive request failed (${res.status})`);
  return (await res.json()) as ArchivedResult;
}

/** One finished tournament's full record; it never changes, so it is fetched once and kept. */
export function useArchivedResult(id: bigint | number | null, enabled = true) {
  return useQuery({
    queryKey: ["archived-result", id?.toString()],
    queryFn: () => fetchArchivedResult(id!.toString()),
    enabled: id != null && enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function toTournamentAccount(a: ArchivedTournament): TournamentAccount {
  return {
    authority: new PublicKey(a.authority),
    id: BigInt(a.id),
    entryFeeLamports: BigInt(a.entryFeeLamports),
    startTs: BigInt(a.startTs),
    endTs: BigInt(a.endTs),
    assetCount: a.assetCount,
    entryCount: a.entryCount,
    settledCount: a.entryCount,
    prizePoolLamports: BigInt(a.prizePoolLamports),
    status: a.status,
    winnersCount: a.winnersCount,
    thresholdScoreBps: a.thresholdScoreBps,
    distributedPoolLamports: BigInt(a.distributedPoolLamports),
    entryMode: a.entryMode,
    guaranteedAmountLamports: BigInt(a.guaranteedAmountLamports),
    vaultBump: 0,
    bump: 0,
    // Archived = fully wound down already, so the prize plan was necessarily locked in and fully spent.
    prizesAssignedLamports: BigInt(a.distributedPoolLamports),
    prizesFinalized: true,
    mint: a.mint ? new PublicKey(a.mint) : PublicKey.default,
  };
}

export function toEntryRows(r: ArchivedResult): { publicKey: PublicKey; account: EntryAccount }[] {
  const tournament = tournamentPda(BigInt(r.tournament.id))[0];
  return r.entries.map((e) => {
    const player = new PublicKey(e.player);
    return {
      publicKey: entryPda(tournament, player, e.entryIndex)[0],
      account: {
        tournament,
        player,
        entryIndex: e.entryIndex,
        picks: e.picks.map((p) => new PublicKey(p)),
        fpSpent: e.fpSpent,
        scoreBps: e.scoreBps,
        settled: true,
        claimed: BigInt(e.prizeLamports) > 0n,
        createdAt: BigInt(e.createdAt),
        bump: 0,
        prizeLamports: BigInt(e.prizeLamports),
      },
    };
  });
}

export function toAssetRows(r: ArchivedResult): { publicKey: PublicKey; account: AssetPriceAccount }[] {
  const tournament = tournamentPda(BigInt(r.tournament.id))[0];
  return r.assets.map((a) => {
    const mint = new PublicKey(a.mint);
    return {
      publicKey: assetPda(tournament, mint)[0],
      account: {
        tournament,
        mint,
        startPriceMicros: BigInt(a.startPriceMicros),
        endPriceMicros: BigInt(a.endPriceMicros),
        resolved: true,
        bump: 0,
      },
    };
  });
}
