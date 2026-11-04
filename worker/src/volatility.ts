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
const NO_DATA_RETRY_MS = 20 * 60_000; // young coins gain history (and a refused pass leaves gaps), so look again soon
const DEX_BATCH = 30; // DexScreener's tokens endpoint takes up to 30 addresses per call
const EMA_ALPHA = 0.15; // each 3h sample moves the stored value 15%: about a day of memory
// DexScreener now and then reports an absurd change (a broken trade, a fresh pool's first price): ZEC and
// tokenised gold once showed tens of thousands of % "per hour". Because the average decays slowly, one such
// sample poisoned a coin's group for days. So a sample is capped outright, and may be at most SPIKE_FACTOR
// times the coin's previous value: a real change of character still gets through, over a few passes.
const MAX_MOVE_PCT = 50; // typical 1-hour move; the wildest real coins sit well below this (Degen starts at 10)
const SPIKE_FACTOR = 4;
// A pool this shallow isn't a price (jlUSDC, a lending receipt worth ~1 USDC, "moved 13%/h" in a $322 pool).
const MIN_PAIR_LIQUIDITY_USD = 10_000;
// Without a real sample for this long a stored value is no longer trusted: the coin falls back to the
// market-cap / age stand-in until it can be measured again.
const STALE_MS = 24 * 3600_000;

export interface VolEntry {
  /** Typical 1-hour move in %, or null when there wasn't enough trading data yet. */
  v: number | null;
  /** When this coin was last looked at. */
  at: number;
  /** When it last got a real sample (absent on entries from before 2026-11-04: treated as stale). */
  ok?: number;
  /** Group name with hysteresis applied (absent on entries seeded from a script — derived from v then). */
  g?: string;
}
export type VolMap = Record<string, VolEntry>;

// Stored values used to be per 10 minutes; a marker entry records the horizon they are in. Volatility
// scales with the square root of time, so old values convert exactly (x sqrt(6)).
const HORIZON_KEY = "__horizon_min";
const OLD_TO_HOUR = Math.sqrt(6);
// Marks the one-time clean-up of values poisoned before the caps existed (2026-11-04).
const CAPPED_KEY = "__capped";

export async function loadVolMap(env: Env): Promise<VolMap> {
  const vols = ((await env.CACHE.get(KEY, "json")) as VolMap | null) ?? {};
  let changed = false;
  if (Object.keys(vols).length > 0 && vols[HORIZON_KEY]?.v !== 60) {
    for (const e of Object.values(vols)) {
      if (e.v == null) continue;
      e.v = e.v * OLD_TO_HOUR;
      e.g = tierForMove(e.v).name;
    }
    vols[HORIZON_KEY] = { v: 60, at: Date.now() };
    changed = true;
  }
  if (Object.keys(vols).length > 0 && vols[CAPPED_KEY]?.v !== 1) {
    // Forget every value above the cap: those coins count as never measured and are re-sampled first.
    for (const [mint, e] of Object.entries(vols)) {
      if (!mint.startsWith("__") && e.v != null && e.v > MAX_MOVE_PCT) delete vols[mint];
    }
    vols[CAPPED_KEY] = { v: 1, at: Date.now() };
    changed = true;
  }
  if (changed) await env.CACHE.put(KEY, JSON.stringify(vols));
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
  // One window wildly out of line with the others (more than 4x the next one's hourly move) is a data glitch,
  // not the coin's character: leave it out.
  parts.sort((a, b) => b - a);
  if (parts[0] > 16 * parts[1]) parts.shift();
  return Math.sqrt(parts.reduce((a, b) => a + b, 0) / parts.length);
}

async function fetchBatch(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const res = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + mints.join(","));
  // A refused or odd answer says nothing about the coins: throw, so the caller leaves their values alone.
  if (!res.ok) throw new Error("DexScreener answered " + res.status);
  const pairs = (await res.json()) as DexPair[];
  if (!Array.isArray(pairs)) throw new Error("DexScreener sent no list");
  // Only pairs where the coin is the base token: priceChange is quoted for the base.
  const best = new Map<string, DexPair>();
  for (const p of pairs) {
    const a = p.baseToken?.address;
    if (!a || !p.priceChange) continue;
    const cur = best.get(a);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(a, p);
  }
  for (const [mint, p] of best) {
    if ((p.liquidity?.usd ?? 0) < MIN_PAIR_LIQUIDITY_USD) continue;
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
  let failure = "";
  for (let b = 0; b < maxBatches; b++) {
    const batch = due.slice(b * DEX_BATCH, (b + 1) * DEX_BATCH);
    if (batch.length === 0) break;
    let samples: Map<string, number>;
    try {
      samples = await fetchBatch(batch);
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
      break; // refused or a network hiccup: these coins keep their values, try again next tick
    }
    for (const mint of batch) {
      tried++;
      const prev = vols[mint];
      const s = samples.get(mint);
      if (s == null) {
        // Nothing usable for this coin now: keep a recent earlier measurement, and look again in a few hours.
        // (Values from before `ok` existed start their 24 hours now.)
        const lastOk = prev?.ok ?? now;
        const fresh = prev?.v != null && now - lastOk < STALE_MS;
        vols[mint] = fresh ? { ...prev!, at: now, ok: lastOk } : { v: null, at: now };
        continue;
      }
      const capped = Math.min(s, MAX_MOVE_PCT, prev?.v != null ? Math.max(prev.v * SPIKE_FACTOR, 1) : Infinity);
      const v = prev?.v != null ? Math.sqrt((1 - EMA_ALPHA) * prev.v * prev.v + EMA_ALPHA * capped * capped) : capped;
      const g = tierForMove(v, prev?.g ?? (prev?.v != null ? tierForMove(prev.v).name : undefined)).name;
      vols[mint] = { v, at: now, g, ok: now };
      sampled++;
    }
  }

  if (tried > 0) await env.CACHE.put(KEY, JSON.stringify(vols));
  const known = mints.filter((m) => vols[m]?.v != null).length;
  return (failure ? "stopped (" + failure + "); " : "") + sampled + "/" + tried + " sampled this tick; " + known + "/" + mints.length + " coins have a volatility, " + (due.length - tried) + " still due";
}
