import type { Env } from "./env";

// Per-tournament progress, kept in KV so a tick never re-reads the chain for
// work that's already finished (every getProgramAccounts is 10 Helius
// credits — see the 2026-09-19 credit-spike note in syncPrices.ts).
//   start:   every picked coin has its start price on-chain
//   end:     every registered coin has its end price on-chain
//   settled: entries scored, tournament finalized, winners paid (or refunded)
export interface TournamentFlags {
  start?: boolean;
  end?: boolean;
  settled?: boolean;
}
export type TournamentStates = Record<string, TournamentFlags>;

const KEY = "tournament-state";
const KEEP_MS = 24 * 3600 * 1000; // ids are ms timestamps; the work window is hours, so a day is plenty

export async function loadStates(env: Env): Promise<{ states: TournamentStates; snapshot: string }> {
  const raw = ((await env.CACHE.get(KEY, "json")) as TournamentStates | null) ?? {};
  return { states: raw, snapshot: JSON.stringify(raw) };
}

/** Writes back only if something changed, and drops entries older than a day. */
export async function saveStates(env: Env, loaded: { states: TournamentStates; snapshot: string }): Promise<void> {
  const cutoff = Date.now() - KEEP_MS;
  for (const id of Object.keys(loaded.states)) {
    if (Number(id) < cutoff) delete loaded.states[id];
  }
  const next = JSON.stringify(loaded.states);
  if (next !== loaded.snapshot) await env.CACHE.put(KEY, next);
}
