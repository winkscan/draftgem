import type { TournamentAccount } from "./accounts";

export type TournamentPhase = "upcoming" | "live" | "results";

// Purely time-based, not tied to whether `finalize_tournament` has actually
// been called yet — the user's explicit spec: a tournament moves to Live
// the moment its entry window closes (now >= start_ts), and to Results once
// its round is over (now >= end_ts), regardless of admin/backend follow-up.
export function getTournamentPhase(t: Pick<TournamentAccount, "startTs" | "endTs">, nowUnixSeconds: number): TournamentPhase {
  if (nowUnixSeconds < Number(t.startTs)) return "upcoming";
  if (nowUnixSeconds < Number(t.endTs)) return "live";
  return "results";
}
