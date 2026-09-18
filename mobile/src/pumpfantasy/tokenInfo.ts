import { useQuery } from "@tanstack/react-query";

// Off-chain token metadata (name/symbol/icon), Jupiter's free "lite" tier —
// no API key needed. Same endpoint/shape SwapKings mobile already uses in
// production. Purely for display — never touches program logic, and has
// nothing to do with the real price-feed integration (Jupiter Price API +
// DexScreener discovery) still on the backlog for actual FP-pricing/scoring.
export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
}

// DexScreener re-hosts token images on its own CDN keyed only by mint (no
// lookup call needed) — tried first since Jupiter's own `icon` field often
// points at the original launchpad storage (arweave/irys/pinata), which
// 404s transiently even for tokens Jupiter itself currently indexes
// (confirmed on SwapKings, 2026-09-15). Jupiter's `icon` is the fallback.
export function dexscreenerIconUrl(mint: string): string {
  return `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png?size=lg`;
}

export function useTokenInfos(mints: string[]) {
  const key = [...mints].sort().join(",");
  return useQuery({
    queryKey: ["token-infos", key],
    queryFn: () => getTokenInfos(mints),
    enabled: mints.length > 0,
    staleTime: 5 * 60_000,
  });
}

export async function getTokenInfos(mints: string[]): Promise<Record<string, TokenInfo>> {
  if (mints.length === 0) return {};
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(",")}`);
  if (!res.ok) return {};
  const data = (await res.json()) as any[];
  const out: Record<string, TokenInfo> = {};
  for (const t of data) {
    const mint = t.id ?? t.address;
    if (!mint) continue;
    out[mint] = { symbol: t.symbol, name: t.name, decimals: t.decimals, icon: t.icon };
  }
  return out;
}
