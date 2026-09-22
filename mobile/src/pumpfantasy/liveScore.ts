import { PublicKey } from "@solana/web3.js";
import { BPS_DENOMINATOR, RAKE_BPS, SCORE_FLOOR_BPS } from "./config";
import type { AssetPriceAccount, TournamentAccount } from "./accounts";
import type { PayoutChoice } from "./customTournaments";

/** How many of `n` players win before ties widen the set. Mirrors the worker's winnerTarget (settlement.ts). */
export function winnerTarget(payout: PayoutChoice, n: number): number {
  switch (payout) {
    case "top1":
    case "pvp":
      return 1;
    case "top3":
      return Math.min(3, Math.max(1, n));
    case "p30":
      return Math.max(1, Math.ceil(n * 0.3));
    case "p50":
      return Math.max(1, Math.ceil(n / 2));
  }
}

/**
 * Relative weights for each paid rank, best place first — mirrors the worker's `slotsFor`
 * (settlement.ts) exactly, since it's what actually decides the real prize plan on chain.
 * Top 1/PvP: winner takes all. Top 3: fixed 50/30/15. 30%: a linear taper from 1st to last.
 * 50%/PvP: every paid place is worth the same.
 */
export function slotsFor(payout: PayoutChoice, n: number): number[] {
  switch (payout) {
    case "top1":
    case "pvp":
      return [1];
    case "top3":
      return [50, 30, 15].slice(0, Math.min(3, Math.max(1, n)));
    case "p30": {
      const k = Math.max(1, Math.ceil(n * 0.3));
      return Array.from({ length: k }, (_, i) => k - i);
    }
    case "p50": {
      const k = Math.max(1, Math.ceil(n / 2));
      return Array.from({ length: k }, () => 1);
    }
  }
}

export interface PickScore {
  mint: string;
  /** % change since the tournament's shared start price, in bps, floored at -100%. null = no price yet. */
  bps: number | null;
}

export interface PortfolioScore {
  picks: PickScore[];
  /** Average of the 5 picks (same as `settle_entry`), null until every pick has a price. */
  totalBps: number | null;
}

/**
 * Same formula as `settle_entry` on-chain (score_bps.rs's per-pick % change,
 * floored at -100%, averaged over the 5 picks) — computed here for display.
 * Once a tournament has ended, the asset's submitted end price is used (the
 * real result — this is what Results shows, even though no one has called
 * `settle_entry` yet); while it's live, the current market price. Never
 * written on-chain.
 */
export function computePortfolioScore(
  picks: PublicKey[],
  assetsByMint: Map<string, AssetPriceAccount>,
  livePricesMicros: Record<string, bigint> | undefined,
): PortfolioScore {
  const scored: PickScore[] = picks.map((pick) => {
    const mint = pick.toBase58();
    const asset = assetsByMint.get(mint);
    if (!asset || asset.startPriceMicros === 0n) return { mint, bps: null };
    const price = asset.resolved ? asset.endPriceMicros : livePricesMicros?.[mint];
    if (price == null) return { mint, bps: null };

    const pctBps = ((price - asset.startPriceMicros) * BigInt(BPS_DENOMINATOR)) / asset.startPriceMicros;
    const floored = pctBps < BigInt(SCORE_FLOOR_BPS) ? BigInt(SCORE_FLOOR_BPS) : pctBps;
    return { mint, bps: Number(floored) };
  });

  if (scored.some((p) => p.bps == null)) return { picks: scored, totalBps: null };
  const total = scored.reduce((sum, p) => sum + p.bps!, 0);
  return { picks: scored, totalBps: Math.trunc(total / scored.length) };
}

/**
 * Prize per entry, given every entry's score sorted best-first (null = not scored yet). A live
 * projection only — once a tournament is finalized on chain, each entry's real `prizeLamports`
 * (set by the worker's `set_prize`) is what actually pays out; callers should prefer that field
 * directly once it's available (see LeaderboardScreen) rather than this projection.
 *
 * Groups entries by exact tied score and gives each group its slots' combined weight (see
 * `slotsFor`), split evenly across the group — same algorithm as the worker's real
 * `computePrizes` (settlement.ts), so what's projected here matches what actually gets paid,
 * modulo which entries happen to still be tied once the round truly ends.
 */
export function projectPrizes(
  tournament: Pick<TournamentAccount, "status" | "prizePoolLamports" | "winnersCount" | "distributedPoolLamports">,
  sortedScores: (number | null)[],
  payout: PayoutChoice = "p50",
  /** Extra cut for the tournament's creator, in bps, on top of the platform rake (player-made tournaments). */
  creatorFeeBps = 0,
): bigint[] {
  const out = sortedScores.map(() => 0n);
  if (tournament.status === "cancelled") return out; // nobody wins; fees are refunded
  if (tournament.status === "finalized") {
    // No per-entry data here to read the real prize from — callers should use entry.prizeLamports
    // directly once finalized; this is only a reasonable fallback (flat share) if they don't.
    if (tournament.winnersCount === 0) return out;
    const share = tournament.distributedPoolLamports / BigInt(tournament.winnersCount);
    return sortedScores.map((s) => (s != null ? share : 0n));
  }

  const distributable = (tournament.prizePoolLamports * BigInt(BPS_DENOMINATOR - RAKE_BPS - creatorFeeBps)) / BigInt(BPS_DENOMINATOR);
  const weights = slotsFor(payout, sortedScores.length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let i = 0;
  let slotIndex = 0;
  while (i < sortedScores.length && slotIndex < weights.length) {
    const score = sortedScores[i];
    if (score == null) break; // unscored entries sort last — nothing further can be ranked yet
    let j = i;
    while (j < sortedScores.length && sortedScores[j] === score) j++;
    const groupSize = j - i;
    const consumed = Math.min(groupSize, weights.length - slotIndex);
    const weightSum = weights.slice(slotIndex, slotIndex + consumed).reduce((a, b) => a + b, 0);
    const groupTotal = (distributable * BigInt(weightSum)) / BigInt(totalWeight);
    const share = groupTotal / BigInt(groupSize);
    if (share > 0n) for (let k = i; k < j; k++) out[k] = share;
    slotIndex += consumed;
    i = j;
  }
  return out;
}
