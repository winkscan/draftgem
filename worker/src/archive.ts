import type { Env } from "./env";

// A finished tournament's results, kept off chain.
//
// Once a tournament is over the worker closes its accounts to get the rent back
// (entries -> the players, coin accounts -> whoever paid them, the tournament ->
// us), so the chain no longer holds the standings. This is where the app reads
// them from instead: the full snapshot is written BEFORE anything is closed.
//
// Everything that can exceed 2^53 (lamports, ids) is a string.

export interface ArchivedTournament {
  id: string;
  status: "finalized" | "cancelled";
  authority: string;
  /** SOL when absent (older archives) or the sentinel all-zero mint — otherwise the SPL mint the tournament ran in. */
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

const INDEX_KEY = "results-index";
const KEEP_IN_INDEX = 300;
const resultKey = (id: string) => `result:${id}`;

export async function hasResult(env: Env, id: string): Promise<boolean> {
  return (await env.CACHE.get(resultKey(id))) !== null;
}

export async function saveResult(env: Env, result: ArchivedResult): Promise<void> {
  const id = result.tournament.id;
  await env.CACHE.put(resultKey(id), JSON.stringify(result));
  const index = ((await env.CACHE.get(INDEX_KEY, "json")) as ArchivedTournament[] | null) ?? [];
  const next = [...index.filter((t) => t.id !== id), result.tournament]
    .sort((a, b) => b.endTs - a.endTs)
    .slice(0, KEEP_IN_INDEX);
  await env.CACHE.put(INDEX_KEY, JSON.stringify(next));
}

export async function getResult(env: Env, id: string): Promise<ArchivedResult | null> {
  return (await env.CACHE.get(resultKey(id), "json")) as ArchivedResult | null;
}

/** Summaries of the most recent archived tournaments, newest first. */
export async function listResults(env: Env): Promise<ArchivedTournament[]> {
  return ((await env.CACHE.get(INDEX_KEY, "json")) as ArchivedTournament[] | null) ?? [];
}
