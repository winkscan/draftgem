import type { Env } from "./env";

// Wrapped / bridged versions of big coins that live on Solana. Jupiter's
// market cap for these is only the supply sitting on Solana (Ether (Portal)
// ~$113M, Dogecoin ~$0.9M, Monero ~$1.3M) while the real asset is worth
// billions on its own chain — so the category (and FP cost) must use the
// underlying coin's market cap, per the user (2026-09-19).
//
// A hand-reviewed allowlist of mint -> CoinGecko id of the UNDERLYING coin,
// deliberately NOT matched by ticker or name: same-ticker meme clones exist
// (BTC = "Buy The Cat", ADA/RAIN on pump.fun) and would inherit a
// blue-chip price. Every entry was checked against the live candidate pool
// on 2026-09-19; skipped on purpose: any pump.fun ("...pump") mint and
// anything whose origin wasn't clear. Add a mint here to correct a wrapped
// coin's category.
export const BRIDGED_ASSETS: Record<string, string> = {
  // Bitcoin
  "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij": "bitcoin", // Coinbase Wrapped BTC
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "bitcoin", // Wrapped BTC (Portal)
  "5XZw2LKTyrfvfiskJ78AMpackRjPcyCif1WhUsPDuVqQ": "bitcoin", // Wrapped BTC
  // Ethereum
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ethereum", // Ether (Portal)
  "2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk": "ethereum", // Wrapped Ethereum (Sollet)
  // Other majors
  "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa": "binancecoin", // Binance Coin (Portal)
  "GbbesPbaYh5uiAZSYNXTc7w9jty1rpg3P9L4JeN4LkKc": "tron",
  "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS": "zcash",
  "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g": "hyperliquid",
  "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R": "dogecoin",
  "WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp": "monero",
  "6UpQcMAb5xMzxc7ZfPaVMgx3KqsvKZdT5U718BzD5We2": "ripple", // Wrapped XRP
  "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG": "near", // Wrapped NEAR
  "LinkhB3afbBKb2EQQu7s7umdZceV3wcvAUJhQAfQ23L": "chainlink",
  "uniHfuPhEQSrtpzXpJZDCSq53yaejKKpNhFUiKoHKHV": "uniswap",
  "avaxGHCq3T7hoxd73oY2KY9hJSTaeMibXvHy5KNzh5D": "avalanche-2",
  "suifhC9gU1VbJAPYPTBkHJyyyStKGLLYPVDTmPoqbvA": "sui",
  "taoC6xyv2v8tDLcev4uaGUgV4vdQsWJrGft2kcBRrBY": "bittensor",
  "AavE1kKKnesPw4MuRJmJ9jZs9QzEE8CPxQ3ViczUDfc1": "aave",
  "4SoQ8UkWfeDH47T56PA53CZCeW4KytYCiU65CwBWoJUt": "mantle",
  "72QvBVwpxqmheEPfaCwWSWqEFsUy3rhWt6JhQBMNTwD1": "ethena",
  "Morpho2VPeTr2E1Jx6monxCzF7mqwUnjz74RdwLXYyP": "morpho",
  "5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW": "pax-gold",
  "WLFinEv6ypjkczcS83FZqFpgFZYwQXutRbxGe7oC16g": "world-liberty-financial",
  "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m": "pepe",
  "ARBzQTYDCW2KnVEjs1Mc81LekB1ibVFZKbSVmorkoT9d": "arbitrum",
  "4qQeZ5LwSz6HuupUu8jCtgXyW1mYQcNbFAW1sWZp89HL": "pancakeswap-token",
  "1NJMqVM4PadjuzYmeB7zV7q7DV8oB3ExaQCd9x6KsLz": "injective-protocol",
  "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr": "spx6900", // SPX6900 (Wormhole)
  "HsRpHQn6VbyMs5b5j5SV6xQ2VvpvvCCzu19GjytVSCoz": "starknet",
  "BeGY8KqKxboEwRbJd1q9H2K829jS4Rc5dEyNMYXCbV5p": "non-playable-coin", // NPC (Wormhole)
  "6eftxVbSAunVEoxUWdGhPdxg5UdsJ8Wkwy5w5YFuxouw": "chiliz",
};

const KV_KEY = "underlying-market-caps";
const REFRESH_AFTER_MS = 15 * 60_000;
const RETRY_AFTER_MS = 5 * 60_000;

interface StoredCaps {
  caps: Record<string, number>;
  fetchedAt: number; // last successful refresh
  attemptedAt: number; // last attempt, success or not — throttles retries
}

/**
 * CoinGecko id -> real (cross-chain) market cap in USD, from KV. Refreshed
 * with ONE CoinGecko call for the whole allowlist when older than 15 min,
 * and a failed refresh (CoinGecko 429s Workers' shared egress IP) is retried
 * at most every 5 min while the stale values keep being served — an old ETH
 * market cap is still billions. Only if there has never been a successful
 * fetch does this return {} — callers then fall back to Jupiter's
 * Solana-only cap (wrapped coins temporarily under-categorised, never blocked).
 */
export async function loadUnderlyingMarketCaps(env: Env): Promise<Record<string, number>> {
  const stored = (await env.CACHE.get(KV_KEY, "json")) as StoredCaps | null;
  const now = Date.now();
  if (stored && now - stored.fetchedAt < REFRESH_AFTER_MS) return stored.caps;
  if (stored && now - stored.attemptedAt < RETRY_AFTER_MS) return stored.caps;

  const next: StoredCaps = { caps: stored?.caps ?? {}, fetchedAt: stored?.fetchedAt ?? 0, attemptedAt: now };
  try {
    const ids = [...new Set(Object.values(BRIDGED_ASSETS))].join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true`,
      // CoinGecko answers 403 to requests without a descriptive User-Agent, which
      // Workers don't send by default (confirmed live 2026-09-19).
      { headers: { "User-Agent": "PumpFantasy/1.0 (Cloudflare Worker)" } },
    );
    if (res.ok) {
      const body = (await res.json()) as Record<string, { usd_market_cap?: number }>;
      const caps: Record<string, number> = {};
      for (const [id, v] of Object.entries(body)) if (v.usd_market_cap) caps[id] = v.usd_market_cap;
      if (Object.keys(caps).length > 0) {
        next.caps = { ...next.caps, ...caps };
        next.fetchedAt = now;
      }
    } else {
      console.error(`CoinGecko underlying-mcap fetch failed: ${res.status}`);
    }
  } catch (err) {
    console.error("CoinGecko underlying-mcap fetch threw:", err);
  }
  await env.CACHE.put(KV_KEY, JSON.stringify(next));
  return next.caps;
}

/** Jupiter's (Solana-side) cap, or the underlying coin's real cap if this mint is a known wrapper and that's larger. */
export function effectiveMarketCap(mint: string, jupiterMcap: number, underlying: Record<string, number>): number {
  const id = BRIDGED_ASSETS[mint];
  const real = id ? underlying[id] : undefined;
  return Math.max(jupiterMcap, real ?? 0);
}
