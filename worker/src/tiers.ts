// The five coin groups, by how much a coin actually MOVES — not by size or
// age (user's call 2026-09-21; the mcap-based BlueChip group held 800 tiny old
// coins, and a wrapped DOGE on a thin Solana pool moves 3.7% per 10 minutes,
// more than most memes). Measured as the typical 10-minute move: the standard
// deviation of price changes over the last 24h, scaled to a 10-minute round
// (see volatility.ts). Calmer = cheaper in FP, wilder = pricier, so the 4,000
// FP budget still forces trade-offs.

export interface TierDef {
  name: string;
  /** Upper bound (exclusive) of the typical 10-minute move, in %. */
  maxMovePct: number;
  fpCost: number;
}

export const TIERS: TierDef[] = [
  { name: "Boomer", maxMovePct: 0.5, fpCost: 100 }, // barely moves
  { name: "Grinder", maxMovePct: 1, fpCost: 300 }, // slow crawl
  { name: "Pump", maxMovePct: 2, fpCost: 650 }, // now it's interesting
  { name: "Moon", maxMovePct: 5, fpCost: 1000 }, // big swings
  { name: "Degen", maxMovePct: Infinity, fpCost: 1600 }, // pure chaos
];

// A coin already in a group only leaves it once its move is this far past the
// boundary — otherwise a coin sitting at 0.99% / 1.01% would hop between
// groups (and FP prices) on every daily re-measurement.
const HYSTERESIS = 0.15;

export function tierByName(name: string): TierDef | undefined {
  return TIERS.find((t) => t.name === name);
}

export function tierForMove(movePct: number, previous?: string): TierDef {
  const plain = TIERS.find((t) => movePct < t.maxMovePct) ?? TIERS[TIERS.length - 1];
  const prevIdx = previous ? TIERS.findIndex((t) => t.name === previous) : -1;
  if (prevIdx < 0) return plain;
  const low = prevIdx === 0 ? 0 : TIERS[prevIdx - 1].maxMovePct * (1 - HYSTERESIS);
  const high = TIERS[prevIdx].maxMovePct * (1 + HYSTERESIS);
  return movePct >= low && movePct < high ? TIERS[prevIdx] : plain;
}

/**
 * Stand-in until a coin has been measured (new coins, or before the first
 * full pass over the list): brand-new coins are wild by default, everything
 * else is guessed from market cap — big = calm — the same shape as the old
 * mcap tiers, so nothing is ever left uncategorised.
 */
export function fallbackTier(marketCapUsd: number, ageDays: number): TierDef {
  if (ageDays < 1) return TIERS[TIERS.length - 1];
  if (marketCapUsd >= 500_000_000) return TIERS[0];
  if (marketCapUsd >= 100_000_000) return TIERS[1];
  if (marketCapUsd >= 10_000_000) return TIERS[2];
  if (marketCapUsd >= 1_000_000) return TIERS[3];
  return TIERS[4];
}
