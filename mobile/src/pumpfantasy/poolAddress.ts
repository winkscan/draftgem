import { useQuery } from "@tanstack/react-query";

// GeckoTerminal's public API — free, keyless, no rate-limit issue at this
// app's scale (one lookup per chart open, cached 5min). Used only to turn a
// mint into the pool address GeckoTerminal's embeddable chart needs; see
// components/ChartModal.tsx for why GeckoTerminal over DexScreener/Jupiter
// (confirmed live 2026-09-18: its embed URL renders a real TradingView-style
// candlestick chart with no API key, straight in a WebView).
interface GeckoTerminalPool {
  attributes: { address: string };
}

export function usePoolAddress(mint: string | null) {
  return useQuery({
    queryKey: ["pool-address", mint],
    queryFn: async (): Promise<string | null> => {
      const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: GeckoTerminalPool[] };
      const pools = body.data ?? [];
      // GeckoTerminal already ranks pools by liquidity — the first is the deepest.
      return pools[0]?.attributes.address ?? null;
    },
    enabled: !!mint,
    staleTime: 5 * 60_000,
  });
}
