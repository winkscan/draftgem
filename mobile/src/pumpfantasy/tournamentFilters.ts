import type { TournamentAccount } from "./accounts";
import type { TournamentPhase } from "./tournamentPhase";
import { formatAmountCompact } from "./currency";
import { tournamentDayLabel } from "./tournamentNames";

// Filters shared by Lobby / Live / Results (one set of choices, three lists).
// Three layers, top to bottom in the header: scope tabs, payout-structure
// chips, and two selects (sort + entry type).

export type FilterScope = "all" | "mine";
export type PayoutFilter = "all" | "top1" | "top3" | "p30" | "p50" | "pvp";
export type SortKey = "ending" | "priceAsc" | "priceDesc" | "pool";
export type EntryFilter = "any" | "multi" | "single" | "low" | "big";

export interface TournamentFilters {
  scope: FilterScope;
  payout: PayoutFilter;
  sort: SortKey;
  entry: EntryFilter;
}

export const DEFAULT_FILTERS: TournamentFilters = { scope: "all", payout: "all", sort: "ending", entry: "any" };

export const isDefaultFilters = (f: TournamentFilters) =>
  f.scope === DEFAULT_FILTERS.scope &&
  f.payout === DEFAULT_FILTERS.payout &&
  f.sort === DEFAULT_FILTERS.sort &&
  f.entry === DEFAULT_FILTERS.entry;

export const SCOPE_TABS: { key: FilterScope; label: string }[] = [
  { key: "all", label: "All Tournaments" },
  { key: "mine", label: "My Tournaments" },
];

export const PAYOUT_CHIPS: { key: PayoutFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "top1", label: "Top 1" },
  { key: "top3", label: "Top 3" },
  { key: "p30", label: "30%" },
  { key: "p50", label: "50%" },
  { key: "pvp", label: "PvP" },
];

// "Ending soon" reads oddly once a round is over, so Results shows the same
// sort (by end time) as "Most recent" — newest first instead of oldest first.
export function sortOptions(phase: TournamentPhase): { key: SortKey; label: string }[] {
  return [
    { key: "ending", label: phase === "results" ? "Most recent" : "Ending soon" },
    { key: "priceAsc", label: "Price ascending" },
    { key: "priceDesc", label: "Price descending" },
    { key: "pool", label: "Biggest pools" },
  ];
}

export const ENTRY_OPTIONS: { key: EntryFilter; label: string }[] = [
  { key: "any", label: "All entries" },
  { key: "multi", label: "Multi entry" },
  { key: "single", label: "Single entry" },
  { key: "low", label: "Low cost entry" },
  { key: "big", label: "Big cost entry" },
];

const LAMPORTS_PER_SOL = 1_000_000_000n;
// Entry-fee brackets for the two cost filters. Everything is 0.01 SOL today,
// so today "Low" matches all and "Big" matches none — tune when fees vary.
const LOW_COST_MAX = LAMPORTS_PER_SOL / 20n; // <= 0.05 SOL
const BIG_COST_MIN = LAMPORTS_PER_SOL / 2n; // >= 0.5 SOL

// Cron-made tournaments always pay the top half. Player-made ones can pick another
// structure; it is kept off chain, in the worker's metadata (worker/src/customTournaments.ts),
// and the worker applies it when it finalizes (settlement.ts winnerTarget).
export function payoutStructureOf(
  t: TournamentAccount,
  meta?: Record<string, { payout: Exclude<PayoutFilter, "all"> }>,
): Exclude<PayoutFilter, "all"> {
  return meta?.[t.id.toString()]?.payout ?? "p50";
}

function matchesEntry(t: TournamentAccount, entry: EntryFilter): boolean {
  switch (entry) {
    case "any":
      return true;
    case "multi":
      return t.entryMode === "multiple";
    case "single":
      return t.entryMode === "single";
    case "low":
      return t.entryFeeLamports <= LOW_COST_MAX;
    case "big":
      return t.entryFeeLamports >= BIG_COST_MIN;
  }
}

/** The pool to advertise: the real one, or the house-guaranteed floor if that's bigger. */
export const poolOf = (t: TournamentAccount) =>
  t.prizePoolLamports > t.guaranteedAmountLamports ? t.prizePoolLamports : t.guaranteedAmountLamports;

/**
 * The tournament title as shown in the Lobby/Live/Results cards and the panel header. Nobody has entered
 * yet and there is no house guarantee: showing "0 SKR" reads as an empty, dead tournament, so the pool is
 * left out of the title until it is actually worth announcing.
 */
export function tournamentTitle(t: TournamentAccount, name: string, decimals: number, currency: string): string {
  const day = tournamentDayLabel(t.startTs);
  if (poolOf(t) === 0n) return `${day} ${name}`;
  return `${formatAmountCompact(poolOf(t), decimals)} ${currency} ${day} ${name}`;
}

const cmpBig = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

export function applyTournamentFilters<T extends { publicKey: { toBase58(): string }; account: TournamentAccount }>(
  rows: T[],
  f: TournamentFilters,
  phase: TournamentPhase,
  entered: Set<string> | undefined,
  meta?: Record<string, { payout: Exclude<PayoutFilter, "all"> }>,
): T[] {
  const out = rows.filter((row) => {
    const t = row.account;
    if (f.scope === "mine" && !entered?.has(row.publicKey.toBase58())) return false;
    if (f.payout !== "all" && payoutStructureOf(t, meta) !== f.payout) return false;
    return matchesEntry(t, f.entry);
  });

  // Newest tournament first whenever the chosen key ties.
  const byId = (a: T, b: T) => cmpBig(b.account.id, a.account.id);
  const key = (a: T, b: T): number => {
    switch (f.sort) {
      case "ending":
        return phase === "results"
          ? cmpBig(b.account.endTs, a.account.endTs)
          : cmpBig(a.account.endTs, b.account.endTs);
      case "priceAsc":
        return cmpBig(a.account.entryFeeLamports, b.account.entryFeeLamports);
      case "priceDesc":
        return cmpBig(b.account.entryFeeLamports, a.account.entryFeeLamports);
      case "pool":
        return cmpBig(poolOf(b.account), poolOf(a.account));
    }
  };
  return out.sort((a, b) => key(a, b) || byId(a, b));
}
