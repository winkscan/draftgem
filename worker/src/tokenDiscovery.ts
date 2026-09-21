// Real, launchpad-agnostic token discovery — Jupiter's Token API v2, which
// (unlike DexScreener's free discovery feeds, tried first and found to
// return only ~15-20 Solana candidates per call — not remotely "hundreds")
// gives real age (`firstPool.createdAt`), market cap, liquidity and price
// for every routable Solana token in ONE payload. No pump.fun-specific
// API — deliberately (dozens of Solana launchpads exist now, not just
// pump.fun); Jupiter indexes by trading pair like DexScreener does, so
// this covers every launchpad equally.
//
// Not continuous polling: the candidate list is fetched fresh on each
// `/candidates` HTTP request (the mobile Draft screen's own refetch
// interval governs how often that actually happens) and each `/attest`
// call looks up only the specific mints being attested. Jupiter's
// lite-api tier is free/keyless either way.

import type { Env } from "./env";
import { effectiveMarketCap, loadUnderlyingMarketCaps } from "./bridgedAssets";
import { classify, loadVolMap, type VolMap } from "./volatility";

// The coin groups (Boomer … Degen) are by measured volatility — see tiers.ts
// and volatility.ts. Market cap now only serves the anti-scam floor below.

// User's explicit anti-scam floor, 2026-09-18: "не меньше 100к маркет
// капа и сколько-то ликвидности". Applied uniformly to every group.
export const MIN_LIQUIDITY_USD = 20_000;
export const MIN_MARKET_CAP_USD = 100_000;
const PRICE_SCALE = 1_000_000; // matches constants::PRICE_SCALE in the Rust program

export interface DiscoveredAsset {
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
  /** Typical 10-minute move in %, when this coin has been measured yet (else its group is a market-cap stand-in). */
  volatilityPct?: number;
  // Project links as listed on Jupiter — free with the same payload, used as
  // a fallback for the About tab when DexScreener has no profile.
  website?: string;
  twitter?: string;
  telegram?: string;
}

interface JupiterToken {
  id: string;
  symbol: string;
  name?: string;
  icon?: string;
  mcap?: number;
  liquidity?: number;
  usdPrice?: number;
  website?: string;
  twitter?: string;
  telegram?: string;
  firstPool?: { createdAt?: string };
}

// Four independent Jupiter lists, combined + deduplicated by mint: the
// 3,400+ "verified" list is the main pool (spans every age from brand-new
// to years-old), "recent" / the two trending lists add coverage for very
// fresh tokens the verified list hasn't caught up to yet. Confirmed live
// 2026-09-18: verified alone already returns ~3,470 Solana tokens, vs.
// DexScreener's boosts/profiles feeds' combined ~40-50.
const LIST_ENDPOINTS = [
  "https://lite-api.jup.ag/tokens/v2/tag?query=verified",
  "https://lite-api.jup.ag/tokens/v2/recent",
  "https://lite-api.jup.ag/tokens/v2/toporganicscore/24h?limit=100",
  "https://lite-api.jup.ag/tokens/v2/toptraded/24h?limit=100",
];

// Stablecoins pass the $100k mcap / $20k liquidity floor easily but are a
// pointless pick — pegged price means ~0% movement for the whole round, no
// upside and no real downside either. Excluded from the browsable pool
// outright, per the user's explicit "там нет движения, они лишние"
// (2026-09-18). Two independent signals, either one is enough: a common
// symbol (catches the coins actually named), or the price already sitting
// inside the standard ~3% de-peg tolerance of $1 (catches stablecoins this
// list doesn't happen to name yet, without needing to keep it exhaustive).
const STABLECOIN_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "BUSD",
  "TUSD",
  "FDUSD",
  "USDE",
  "SUSDE",
  "PYUSD",
  "USDY",
  "USDS",
  "USDP",
  "GUSD",
  "USDD",
  "FRAX",
  "LUSD",
  "CRVUSD",
]);
const STABLE_PEG_LOW = 0.97;
const STABLE_PEG_HIGH = 1.03;

function isStablecoin(t: JupiterToken): boolean {
  if (STABLECOIN_SYMBOLS.has(t.symbol.toUpperCase())) return true;
  const price = t.usdPrice ?? 0;
  return price >= STABLE_PEG_LOW && price <= STABLE_PEG_HIGH;
}

export function ageDaysFromCreatedAt(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / (24 * 3600 * 1000);
}

async function fetchJupiterList(url: string): Promise<JupiterToken[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  return (await res.json()) as JupiterToken[];
}

async function fetchAllCandidates(): Promise<JupiterToken[]> {
  const lists = await Promise.all(LIST_ENDPOINTS.map((url) => fetchJupiterList(url).catch(() => [])));
  const byMint = new Map<string, JupiterToken>();
  for (const token of lists.flat()) {
    if (!byMint.has(token.id)) byMint.set(token.id, token);
  }
  return [...byMint.values()];
}

function toDiscovered(
  t: JupiterToken,
  ageDays: number,
  marketCapUsd: number,
  vols: VolMap,
): DiscoveredAsset | null {
  const { tier, movePct } = classify(t.id, marketCapUsd, ageDays, vols);
  const priceUsd = t.usdPrice ?? 0;
  if (Math.round(priceUsd * PRICE_SCALE) <= 0) return null; // too cheap to represent at this fixed-point scale
  return {
    mint: t.id,
    symbol: t.symbol,
    name: t.name ?? t.symbol,
    icon: t.icon,
    tier: tier.name,
    fpCost: tier.fpCost,
    priceUsd,
    ageDays,
    liquidityUsd: t.liquidity ?? 0,
    marketCapUsd,
    volatilityPct: movePct ?? undefined,
    website: t.website || undefined,
    twitter: t.twitter || undefined,
    telegram: t.telegram || undefined,
  };
}

/**
 * The full browsable candidate pool — every real Solana token across
 * Jupiter's combined lists that clears the liquidity+market-cap floor,
 * tagged with its volatility group and FP cost. This is what the mobile
 * Draft screen's "browse all 1000+ coins" view is actually backed by (via the
 * Worker's `/candidates` HTTP endpoint) — nothing here is tournament-
 * specific or pre-registered on-chain.
 */
export async function getAllCandidates(env: Env): Promise<DiscoveredAsset[]> {
  const [candidates, underlying, vols] = await Promise.all([
    fetchAllCandidates(),
    loadUnderlyingMarketCaps(env),
    loadVolMap(env),
  ]);
  const out: DiscoveredAsset[] = [];
  for (const token of candidates) {
    const createdAt = token.firstPool?.createdAt;
    if (!createdAt) continue;
    if ((token.liquidity ?? 0) < MIN_LIQUIDITY_USD) continue;
    const marketCapUsd = effectiveMarketCap(token.id, token.mcap ?? 0, underlying);
    if (marketCapUsd < MIN_MARKET_CAP_USD) continue;
    if (isStablecoin(token)) continue;
    const discovered = toDiscovered(token, ageDaysFromCreatedAt(createdAt), marketCapUsd, vols);
    if (discovered) out.push(discovered);
  }
  return out;
}
