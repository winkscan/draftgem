import { useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WORKER_URL } from "./config";
import { useCandidates, type Candidate } from "./candidates";

// Portfolios store only coin ADDRESSES. Their cards used to look the coins up in the current browsable pool,
// which changes: a coin that drops under the liquidity or market-cap floor leaves it, and its card then showed
// "?". Three sources are combined now, best first:
//   1. a snapshot saved on this phone (when you entered, or when the coin was last seen in the pool), which
//      keeps the FP price and category you actually paid,
//   2. the current pool,
//   3. a lookup of the coin by address on the worker (DexScreener), for coins that left the pool or that
//      other players picked.

const SNAP_KEY = "draftgem.coinSnapshots.v1";
const MAX_SNAPSHOTS = 400;

async function readSnapshots(): Promise<Record<string, Candidate>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SNAP_KEY)) ?? "{}") as Record<string, Candidate>;
  } catch {
    return {};
  }
}

/** Remembers coins (their price and category as of now) so an old portfolio can always show them. */
export async function saveCoinSnapshots(coins: Candidate[]): Promise<void> {
  if (coins.length === 0) return;
  try {
    const all = await readSnapshots();
    for (const c of coins) all[c.mint] = c;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SNAPSHOTS))) delete all[k]; // oldest first
    await AsyncStorage.setItem(SNAP_KEY, JSON.stringify(all));
  } catch {
    // a missing snapshot only means the fallback lookup is used
  }
}

async function fetchCoins(mints: string[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const res = await fetch(WORKER_URL + "/coins?mints=" + mints.slice(i, i + 30).join(","));
      if (res.ok) out.push(...(((await res.json()) as { coins: Candidate[] }).coins ?? []));
    } catch {
      // try again on the next render
    }
  }
  return out;
}

/** Details for the given coin addresses (a portfolio's picks), whether or not they are still in the pool. */
export function useCoinMap(mints: string[]): Map<string, Candidate> {
  const queryClient = useQueryClient();
  const { data: pool } = useCandidates();
  const { data: snaps } = useQuery({ queryKey: ["coin-snapshots"], queryFn: readSnapshots, staleTime: 30_000 });
  const key = useMemo(() => [...new Set(mints)].sort().join(","), [mints]);

  const poolMap = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of pool ?? []) m.set(c.mint, c);
    return m;
  }, [pool]);

  // Coins we know nothing about yet (not on this phone, not in the pool).
  const missing = useMemo(
    () => (key ? key.split(",").filter((m) => m && !poolMap.has(m) && !snaps?.[m]).slice(0, 90) : []), // 3 calls at most
    [key, poolMap, snaps],
  );
  const { data: fetched } = useQuery({
    queryKey: ["coin-details", missing.join(",")],
    queryFn: () => fetchCoins(missing),
    enabled: missing.length > 0 && !!pool && !!snaps,
    staleTime: 10 * 60_000,
  });

  // Save what the pool knows about these coins now, so the card survives the coin leaving the pool.
  useEffect(() => {
    if (!pool || !snaps || !key) return;
    const fresh = key
      .split(",")
      .map((m) => (m && !snaps[m] ? poolMap.get(m) : undefined))
      .filter((c): c is Candidate => !!c);
    if (fresh.length > 0) saveCoinSnapshots(fresh).then(() => queryClient.invalidateQueries({ queryKey: ["coin-snapshots"] }));
  }, [pool, snaps, key, poolMap, queryClient]);

  return useMemo(() => {
    const m = new Map<string, Candidate>(poolMap);
    for (const c of fetched ?? []) if (!m.has(c.mint)) m.set(c.mint, c);
    for (const c of Object.values(snaps ?? {})) m.set(c.mint, c); // the price you paid wins over today's
    return m;
  }, [poolMap, fetched, snaps]);
}
