import { PublicKey } from "@solana/web3.js";
import { BPS_DENOMINATOR, RAKE_BPS, SCORE_FLOOR_BPS } from "./config";
import type { AssetPriceAccount, TournamentAccount } from "./accounts";

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
 * Projected prize for a 1-based rank. Mirrors finalize_tournament/claim_prize:
 * the top half of entrants split the pool (minus the 5% rake) equally. Once
 * a tournament is finalized on-chain, its real winners_count/distributed
 * pool are used. Ranking itself is off-chain, so this is a projection until
 * then — and note nothing calls settle/finalize/claim automatically yet.
 */
export function projectedPrizeLamports(
  tournament: Pick<TournamentAccount, "status" | "prizePoolLamports" | "winnersCount" | "distributedPoolLamports">,
  rank: number,
  entryCount: number,
): bigint {
  if (tournament.status === "finalized") {
    if (tournament.winnersCount === 0 || rank > tournament.winnersCount) return 0n;
    return tournament.distributedPoolLamports / BigInt(tournament.winnersCount);
  }
  const winners = Math.max(1, Math.ceil(entryCount / 2));
  if (rank > winners) return 0n;
  const distributable = (tournament.prizePoolLamports * BigInt(BPS_DENOMINATOR - RAKE_BPS)) / BigInt(BPS_DENOMINATOR);
  return distributable / BigInt(winners);
}
