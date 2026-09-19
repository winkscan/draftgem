import type { Env } from "./env";

// Historical prices: "the price of this coin at exactly start_ts / end_ts",
// not "whatever the price was when a cron tick got around to looking". That
// makes the result independent of cron timing, lets a missed price be filled
// in hours later without being unfair, and is the main safety net against a
// tournament getting stuck unsettled (settle_entry needs every pick's start
// AND end price on-chain).
//
// Source: GeckoTerminal's free OHLCV candles for the coin's deepest pool
// (pool address from DexScreener, which is generous with rate limits and
// cached in KV forever). GeckoTerminal itself rate-limits hard (measured
// 2026-09-19: 429 after a handful of calls), so callers get a small per-tick
// budget, and anything that doesn't fit simply waits for the next tick — since
// history doesn't expire, waiting costs nothing.

const PAIR_TTL_SECONDS = 30 * 24 * 3600;

export interface PriceBudget {
  /** GeckoTerminal calls this tick may still make. Set to 0 on a 429 so we stop hammering. */
  geckoCalls: number;
}

interface DexPair {
  pairAddress: string;
  liquidity?: { usd?: number };
}

async function pairAddress(env: Env, mint: string): Promise<string | null> {
  const key = `pair:${mint}`;
  const cached = await env.CACHE.get(key);
  if (cached) return cached;

  const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`);
  if (!res.ok) return null;
  const pairs = (await res.json()) as DexPair[];
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const best = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
  await env.CACHE.put(key, best.pairAddress, { expirationTtl: PAIR_TTL_SECONDS });
  return best.pairAddress;
}

/**
 * USD price of `mint` at unix second `ts`, or null if it can't be determined
 * right now (rate-limited, no pool, no data) — callers retry later.
 *
 * Candles only exist for minutes that had trades. The candle covering `ts`
 * gives its OPEN (the price at the start of that minute — exact for our
 * minute-aligned start/end times); if the latest candle is older than that,
 * the coin didn't trade since, so its CLOSE is the last real price.
 */
export async function priceAtTimestamp(env: Env, mint: string, ts: number, budget: PriceBudget): Promise<number | null> {
  if (budget.geckoCalls <= 0) return null;
  const pair = await pairAddress(env, mint);
  if (!pair) return null;

  budget.geckoCalls--;
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair}/ohlcv/minute?aggregate=1&before_timestamp=${ts + 60}&limit=30&currency=usd`,
    { headers: { Accept: "application/json", "User-Agent": "PumpFantasy/1.0 (Cloudflare Worker)" } },
  );
  if (res.status === 429) {
    budget.geckoCalls = 0;
    return null;
  }
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const candles = (body.data?.attributes?.ohlcv_list ?? []).filter((c) => c[0] <= ts).sort((a, b) => b[0] - a[0]);
  const latest = candles[0];
  if (!latest) return null;
  const price = ts - latest[0] < 60 ? latest[1] : latest[4];
  return price > 0 ? price : null;
}
