import type { Env } from "./env";
import type { PriceBudget } from "./priceHistory";
import { fallbackTier, tierByName, tierForMove, type TierDef } from "./tiers";

// How much each coin actually moves, measured from DexScreener's own price changes and stored in KV.
//
// Measure: each pair reports its price change over 5 minutes, 1, 6 and 24 hours. A change over a
// window is one random draw whose typical size grows with the square root of time, so scaling every
// window to one hour and taking the root of the mean square estimates the "typical 1-hour move" in %
// (the shortest tournament's length). One sample is noisy, so it is blended into a running average
// (EMA) with every later pass: a single odd hour can't flip a coin's group.
//
// Free and generous: the tokens endpoint takes 30 coins per call and covers every coin DexScreener
// lists, SOL and the majors included. (The earlier GeckoTerminal-candle source answered 429 to
// Cloudflare's shared IPs and left ~1000 coins unmeasured.)
//
// Both /candidates and /attest read the SAME stored value, so a coin's group and FP price can't
// differ between the Draft list and the entry signature, or between two players in the same round.

const KEY = "volatility";
const REFRESH_MS = 3 * 3600_000; // each pass adds one sample to the running average
const NO_DATA_RETRY_MS = 3 * 3600_000; // young coins gain history, so look again
const DEX_BATCH = 30; // DexScreener's tokens endpoint takes up to 30 addresses per call
const EMA_ALPHA = 0.15; // each 3h sample moves the stored value 15%: about a day of memory

export interface VolEntry {
  /** Typical 1-hour move in %, or null when there wasn't enough trading data yet. */
  v: number | null;
  /** When this coin was last looked at. */
  at: number;
  /** Group name with hysteresis applied (absent on entries seeded from a script — derived from v then). */
  g?: string;
}
export type VolMap = Record<string, VolEntry>;

// Stored values used to be per 10 minutes; a marker entry records the horizon they are in. Volatility
// scales with the square root of time, so old values convert exactly (x sqrt(6)).
const HORIZON_KEY = "__horizon_min";
const OLD_TO_HOUR = Math.sqrt(6);

export async function loadVolMap(env: Env): Promise<VolMap> {
  const vols = ((await env.CACHE.get(KEY, "json")) as VolMap | null) ?? {};
  if (Object.keys(vols).length > 0 && vols[HORIZON_KEY]?.v !== 60) {
    for (const e of Object.values(vols)) {
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

interface DexPair {
  baseToken?: { address?: string };
  liquidity?: { usd?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
}

/** One 1-hour-move sample from a pair's price changes, or null without enough history. */
export function sampleFromChanges(c: { m5?: number; h1?: number; h6?: number; h24?: number }): number | null {
  const parts: number[] = [];
  if (typeof c.m5 === "number") parts.push(c.m5 * c.m5 * 12);
  if (typeof c.h1 === "number") parts.push(c.h1 * c.h1);
  if (typeof c.h6 === "number") parts.push((c.h6 * c.h6) / 6);
  if (typeof c.h24 === "number") parts.push((c.h24 * c.h24) / 24);
  if (parts.length < 3) return null; // a brand-new pool without a 24h history isn't a measurement
  return Math.sqrt(parts.reduce((a, b) => a + b, 0) / parts.length);
}

async function fetchBatch(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const res = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + mints.join(","));
  if (!res.ok) return out;
  const pairs = (await res.json()) as DexPair[];
  if (!Array.isArray(pairs)) return out;
  // Only pairs where the coin is the base token: priceChange is quoted for the base.
  const best = new Map<string, DexPair>();
  for (const p of pairs) {
    const a = p.baseToken?.address;
    if (!a || !p.priceChange) continue;
    const cur = best.get(a);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(a, p);
  }
  for (const [mint, p] of best) {
    const v = sampleFromChanges(p.priceChange!);
    if (v != null) out.set(mint, v);
  }
  return out;
}

/**
 * Re-samples the coins that are due, never-measured first, then oldest: `maxBatches` calls of 30
 * coins per tick, so the whole list is covered about every half hour.
 */
export async function refreshVolatility(env: Env, mints: string[], _budget: PriceBudget, maxBatches = 6): Promise<string> {
  const vols = await loadVolMap(env);
  const now = Date.now();
  const due = mints
    .filter((m) => {
      const e = vols[m];
      return !e || now - e.at > (e.v == null ? NO_DATA_RETRY_MS : REFRESH_MS);
    })
    .sort((a, b) => (vols[a]?.at ?? 0) - (vols[b]?.at ?? 0));

  let sampled = 0;
  let tried = 0;
  for (let b = 0; b < maxBatches; b++) {
    const batch = due.slice(b * DEX_BATCH, (b + 1) * DEX_BATCH);
    if (batch.length === 0) break;
    let samples: Map<string, number>;
    try {
      samples = await fetchBatch(batch);
    } catch {
      break; // network hiccup: try again next tick
    }
    for (const mint of batch) {
      tried++;
      const prev = vols[mint];
      const s = samples.get(mint);
      if (s == null) {
        // Nothing usable now: keep any earlier measurement, and look again in a few hours.
        vols[mint] = prev?.v != null ? { ...prev, at: now } : { v: null, at: now };
        continue;
      }
      const v = prev?.v != null ? Math.sqrt((1 - EMA_ALPHA) * prev.v * prev.v + EMA_ALPHA * s * s) : s;
      const g = tierForMove(v, prev?.g ?? (prev?.v != null ? tierForMove(prev.v).name : undefined)).name;
      vols[mint] = { v, at: now, g };
      sampled++;
    }
  }

  if (tried > 0) await env.CACHE.put(KEY, JSON.stringify(vols));
  const known = mints.filter((m) => vols[m]?.v != null).length;
  return sampled + "/" + tried + " sampled this tick; " + known + "/" + mints.length + " coins have a volatility, " + (due.length - tried) + " still due";
}
