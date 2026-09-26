import type { Env } from "./env";
import { classify, loadVolMap } from "./volatility";

// Details of arbitrary coins by mint, for the app's portfolio cards: a coin someone picked can drop out of
// the browsable pool later (liquidity or market cap under the floor, delisted from Jupiter's lists), and its
// card would then have nothing to show. DexScreener knows most coins whatever the pool says. The category and
// FP price returned are TODAY's for that coin (the app prefers the price the player actually paid when it saved one).

interface DexPair {
  baseToken?: { address?: string; symbol?: string; name?: string };
  info?: { imageUrl?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
}

export interface CoinInfo {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  tier: string;
  fpCost: number;
  priceUsd: number;
  ageDays: number;
  liquidityUsd: number;
  marketCapUsd: number;
  volatilityPct?: number;
}

export async function coinDetails(env: Env, mints: string[]): Promise<CoinInfo[]> {
  const unique = [...new Set(mints)].filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)).slice(0, 30);
  if (unique.length === 0) return [];
  const res = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + unique.join(","));
  if (!res.ok) return [];
  const pairs = (await res.json()) as DexPair[];
  if (!Array.isArray(pairs)) return [];
  const best = new Map<string, DexPair>();
  for (const p of pairs) {
    const a = p.baseToken?.address;
    if (!a) continue;
    const cur = best.get(a);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(a, p);
  }
  const vols = await loadVolMap(env);
  const out: CoinInfo[] = [];
  for (const [mint, p] of best) {
    const marketCapUsd = p.marketCap ?? p.fdv ?? 0;
    const ageDays = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 86400_000 : 0;
    const { tier, movePct } = classify(mint, marketCapUsd, ageDays, vols);
    out.push({
      mint,
      symbol: p.baseToken?.symbol ?? "?",
      name: p.baseToken?.name ?? p.baseToken?.symbol ?? "",
      icon: p.info?.imageUrl,
      tier: tier.name,
      fpCost: tier.fpCost,
      priceUsd: Number(p.priceUsd ?? 0),
      ageDays,
      liquidityUsd: p.liquidity?.usd ?? 0,
      marketCapUsd,
      volatilityPct: movePct ?? undefined,
    });
  }
  return out;
}
