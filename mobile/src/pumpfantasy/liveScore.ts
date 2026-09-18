import { PublicKey } from "@solana/web3.js";
import { BPS_DENOMINATOR, SCORE_FLOOR_BPS } from "./config";
import type { AssetPriceAccount } from "./accounts";

/**
 * Same formula as `settle_entry` on-chain (score_bps.rs's per-pick % change,
 * floored at -100%, averaged over the 5 picks) — computed here purely for
 * display, against live current prices instead of the final submitted
 * result. This previews what settlement will eventually produce; it is
 * never itself written on-chain.
 */
export function computeLiveScoreBps(
  picks: PublicKey[],
  assetsByMint: Map<string, AssetPriceAccount>,
  currentPricesMicros: Record<string, bigint>,
): number | null {
  let totalBps = 0n;
  let known = 0;

  for (const pick of picks) {
    const mint = pick.toBase58();
    const asset = assetsByMint.get(mint);
    const current = currentPricesMicros[mint];
    if (!asset || current == null || asset.startPriceMicros === 0n) continue;

    const pctBps = ((current - asset.startPriceMicros) * BigInt(BPS_DENOMINATOR)) / asset.startPriceMicros;
    const floored = pctBps < BigInt(SCORE_FLOOR_BPS) ? BigInt(SCORE_FLOOR_BPS) : pctBps;
    totalBps += floored;
    known += 1;
  }

  if (known < picks.length) return null; // don't show a partial/misleading average until every pick has a live price
  return Number(totalBps / BigInt(picks.length));
}
