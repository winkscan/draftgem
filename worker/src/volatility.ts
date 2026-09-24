import type { Env } from "./env";
import { pairAddress, type PriceBudget } from "./priceHistory";
import { fallbackTier, tierByName, tierForMove, type TierDef } from "./tiers";

// How much each coin actually moves, measured from candles and stored in KV.
//
// Measure: the standard deviation of price changes between consecutive
// 5-minute candles over the last 24h, scaled to a 10-minute round (the length
// of a tournament) — "the typical 10-minute move", in %. Gaps (minutes with
// no trades produce no candle) are normalised so an illiquid coin isn't
// counted as more volatile just because its candles are far apart.
//
// Not recomputed per request and not once: each coin is re-measured about once
// a day, a few per cron tick (GeckoTerminal's free tier 429s quickly), and the
// group only changes when the move clears a boundary by a margin
// (tiers.ts HYSTERESIS). Both /candidates and /attest read the SAME stored
// value, so a coin's group and FP price can't differ between the Draft list
// and the entry signature, or between two players in the same round.

const KEY = "volatility";
const REFRESH_MS = 24 * 3600_000;
const NO_DATA_RETRY_MS = 3 * 3600_000; // young coins gain candles, so look again sooner
const MIN_CANDLES = 48; // about 4 hours of real trading; less than that isn't a measurement

export interface VolEntry {
  /** Typical 10-minute move in %, or null when there wasn't enough trading data yet. */
  v: number | null;
  /** When this coin was last looked at. */
  at: number;
  /** Group name with hysteresis applied (absent on entries seeded from a script — derived from v then). */
  g?: string;
}
export type VolMap = Record<string, VolEntry>;

// Stored values used to be per 10 minutes; a marker entry records the horizon they are in. Volatility
// scales with the square root of time, so old values convert exactly (x sqrt(6)) and the whole list
// keeps its measurements instead of being re-fetched coin by coin.
const HORIZON_KEY = "__horizon_min";
const OLD_TO_HOUR = Math.sqrt(6);

export async function loadVolMap(env: Env): Promise<VolMap> {
  const vols = ((await env.CACHE.get(KEY, "json")) as VolMap | null) ?? {};
  if (Object.keys(vols).length > 0 && vols[HORIZON_KEY]?.v !== 60) {
    for (const [mint, e] of Object.entries(vols)) {
      if (e.v == null) continue;
      e.v = e.v * OLD_TO_HOUR;
      e.g = tierForMove(e.v).name;
    }
    vols[HORIZON_KEY] = { v: 60, at: Date.now() };
    await env.CACHE.put(KEY, JSON.stringify(vols));
  }
  return vols;
}

/**
 * The group and FP price for a coin, from its stored measurement; before it's
 * been measured, a stand-in from market cap / age (tiers.ts fallbackTier).
 */
export function classify(
  mint: string,
  marketCapUsd: number,
  ageDays: number,
  vols: VolMap,
): { tier: TierDef; movePct: number | null } {
  const e = vols[mint];
  if (e && e.v != null) {
    const tier = (e.g && tierByName(e.g)) || tierForMove(e.v);
    return { tier, movePct: e.v };
  }
  return { tier: fallbackTier(marketCapUsd, ageDays), movePct: null };
}

/** Typical 10-minute move in % from 5-minute candles ([ts, o, h, l, c, v], any order), or null if too few. */
export function moveFromCandles(list: number[][]): number | null {
  const candles = [...list].filter((c) => c[4] > 0).sort((a, b) => a[0] - b[0]);
  if (candles.length < MIN_CANDLES) return null;
  let acc = 0;
  let n = 0;
  for (let i = 1; i < candles.length; i++) {
    const gap = (candles[i][0] - candles[i - 1][0]) / 300; // in 5-minute steps
    if (gap <= 0) continue;
    const r = Math.log(candles[i][4] / candles[i - 1][4]);
    acc += (r * r) / gap;
    n++;
  }
  if (n === 0) return null;
  return Math.sqrt((acc / n) * 12) * 100; // variance per 5 min -> per hour (12 steps)
}

async function measureMove(env: Env, mint: string, budget: PriceBudget): Promise<number | null | "limited"> {
  if (budget.geckoCalls <= 0) return "limited";
  const pair = await pairAddress(env, mint, false);
  if (!pair) return null;
  budget.geckoCalls--;
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair}/ohlcv/minute?aggregate=5&limit=288&currency=usd&token=${mint}`,
    { headers: { Accept: "application/json", "User-Agent": "PumpFantasy/1.0 (Cloudflare Worker)" } },
  );
  if (res.status === 429) {
    budget.geckoCalls = 0;
    return "limited";
  }
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  return moveFromCandles(body.data?.attributes?.ohlcv_list ?? []);
}

/**
 * Re-measures the coins that are due, never-measured first, then oldest. Uses
 * only the GeckoTerminal budget left over after tournament prices (which come
 * first), and at most `maxCalls` coins per tick.
 */
export async function refreshVolatility(env: Env, mints: string[], budget: PriceBudget, maxCalls = 8): Promise<string> {
  const vols = await loadVolMap(env);
  const now = Date.now();
  const due = mints
    .filter((m) => {
      const e = vols[m];
      if (!e) return true;
      return now - e.at > (e.v == null ? NO_DATA_RETRY_MS : REFRESH_MS);
    })
    .sort((a, b) => (vols[a]?.at ?? 0) - (vols[b]?.at ?? 0));

  let calls = 0;
  let measured = 0;
  for (const mint of due) {
    if (calls >= maxCalls) break;
    const move = await measureMove(env, mint, budget);
    if (move === "limited") break;
    calls++;
    const prev = vols[mint];
    if (move == null && prev?.v != null) {
      // A failed/empty fetch must not erase a good measurement: keep it, and just look again in a few hours.
      vols[mint] = { ...prev, at: now - (REFRESH_MS - NO_DATA_RETRY_MS) };
      continue;
    }
    vols[mint] = {
      v: move,
      at: now,
      g: move == null ? undefined : tierForMove(move, prev?.g ?? (prev?.v != null ? tierForMove(prev.v).name : undefined)).name,
    };
    if (move != null) measured++;
  }

  if (calls > 0) await env.CACHE.put(KEY, JSON.stringify(vols));
  const known = mints.filter((m) => vols[m]?.v != null).length;
  return `${measured}/${calls} measured this tick; ${known}/${mints.length} coins have a volatility, ${due.length - calls} still due`;
}
