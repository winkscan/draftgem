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
 * Prize per entry, given every entry's score sorted best-first (null = not
 * scored yet). Mirrors finalize_tournament/claim_prize: the top half of
 * entrants win, and EVERY score at or above the cut-off score wins an equal
 * share of the pool minus the 5% rake — so a tie at the cut-off widens the
 * winner set instead of splitting hairs (the program pays by threshold, not
 * by rank). Once the tournament is finalized on-chain (the Worker does this
 * automatically after the round), its real threshold/winners are used and
 * this stops being a projection.
 */
export function projectPrizes(
  tournament: Pick<
    TournamentAccount,
    "status" | "prizePoolLamports" | "winnersCount" | "distributedPoolLamports" | "thresholdScoreBps"
  >,
  sortedScores: (number | null)[],
  payout: PayoutChoice = "p50",
): bigint[] {
  if (tournament.status === "cancelled") return sortedScores.map(() => 0n); // nobody wins; fees are refunded
  if (tournament.status === "finalized") {
    if (tournament.winnersCount === 0) return sortedScores.map(() => 0n);
    const share = tournament.distributedPoolLamports / BigInt(tournament.winnersCount);
    return sortedScores.map((s) => (s != null && s >= tournament.thresholdScoreBps ? share : 0n));
  }
  const target = winnerTarget(payout, sortedScores.length);
  const threshold = sortedScores[target - 1];
  if (threshold == null) return sortedScores.map(() => 0n); // cut-off entry isn't scored yet
  const winners = sortedScores.filter((s) => s != null && s >= threshold).length;
  const distributable = (tournament.prizePoolLamports * BigInt(BPS_DENOMINATOR - RAKE_BPS)) / BigInt(BPS_DENOMINATOR);
  const share = distributable / BigInt(winners);
  return sortedScores.map((s) => (s != null && s >= threshold ? share : 0n));
}
