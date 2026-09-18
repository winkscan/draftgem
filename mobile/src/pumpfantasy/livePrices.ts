import { useQuery } from "@tanstack/react-query";
import { PRICE_SCALE } from "./config";

// Live prices for the Live-tournament leaderboard — Jupiter Price API
// first (cheap, batched, already used elsewhere in this app), DexScreener
// as a fallback for any mint Jupiter doesn't price yet (brand-new coins).
// Same two free/keyless sources as the Worker's tokenDiscovery.ts, same
// "not continuous polling" spirit — this only runs while a viewer actually
// has the Live screen open, on a tens-of-seconds interval, not per-second.
async function getJupiterPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`);
  if (!res.ok) return {};
  const data = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
  const out: Record<string, number> = {};
  for (const mint of Object.keys(data)) {
    const price = data[mint]?.usdPrice;
    if (price) out[mint] = price;
  }
  return out;
}

async function getDexScreenerPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints.slice(0, 30).join(",")}`);
  if (!res.ok) return {};
  const data = (await res.json()) as {
    pairs?: { baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[];
  };
  const best: Record<string, { price: number; liq: number }> = {};
  for (const pair of data.pairs ?? []) {
    const price = Number(pair.priceUsd ?? 0);
    const liq = pair.liquidity?.usd ?? 0;
    if (!price) continue;
    const mint = pair.baseToken.address;
    if (!best[mint] || best[mint].liq < liq) best[mint] = { price, liq };
  }
  const out: Record<string, number> = {};
  for (const mint of Object.keys(best)) out[mint] = best[mint].price;
  return out;
}

/** USD prices for a set of mints, in the same micro-USD fixed point the on-chain program stores. */
export async function getLivePricesMicros(mints: string[]): Promise<Record<string, bigint>> {
  const unique = [...new Set(mints)];
  const jupiter = await getJupiterPrices(unique);
  const missing = unique.filter((m) => !(m in jupiter));
  const fallback = missing.length > 0 ? await getDexScreenerPrices(missing) : {};
  const merged = { ...jupiter, ...fallback };
  const out: Record<string, bigint> = {};
  for (const mint of unique) {
    const price = merged[mint];
    if (price) out[mint] = BigInt(Math.round(price * PRICE_SCALE));
  }
  return out;
}

export function useLivePrices(mints: string[], enabled: boolean) {
  const key = [...new Set(mints)].sort().join(",");
  return useQuery({
    queryKey: ["live-prices", key],
    queryFn: () => getLivePricesMicros(mints),
    enabled: enabled && mints.length > 0,
    // "not every second, but often enough to notice movement" — user's
    // explicit spec, 2026-09-18.
    refetchInterval: 25_000,
  });
}
