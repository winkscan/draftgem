import { useQuery } from "@tanstack/react-query";

// Price history + "About" info for the in-app chart modal — all free,
// keyless public APIs, fetched straight from the device (same as
// tokenInfo.ts / poolAddress.ts). GeckoTerminal: OHLCV candles + the coin's
// description text (DexScreener's API has links/socials but no description
// text). DexScreener: website/social links, the user's preferred source for
// those.

export const CHART_RANGES = {
  "1H": { timeframe: "minute", aggregate: 1, limit: 60 },
  "24H": { timeframe: "minute", aggregate: 15, limit: 96 },
  "7D": { timeframe: "hour", aggregate: 1, limit: 168 },
  "30D": { timeframe: "hour", aggregate: 4, limit: 180 },
} as const;
export type ChartRange = keyof typeof CHART_RANGES;

export interface PricePoint {
  t: number; // unix seconds
  price: number; // USD, candle close
}

export function usePriceSeries(pool: string | null | undefined, range: ChartRange) {
  return useQuery({
    queryKey: ["price-series", pool, range],
    queryFn: async (): Promise<PricePoint[]> => {
      const { timeframe, aggregate, limit } = CHART_RANGES[range];
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`,
      );
      if (!res.ok) throw new Error(`Chart data unavailable (${res.status})`);
      const body = (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
      const list = body.data?.attributes?.ohlcv_list ?? [];
      // [timestamp, open, high, low, close, volume], newest first
      return list.map((c) => ({ t: c[0], price: c[4] })).sort((a, b) => a.t - b.t);
    },
    enabled: !!pool,
    staleTime: 60_000,
  });
}

export interface TokenLink {
  label: string;
  url: string;
}

export interface TokenAbout {
  description: string | null;
  links: TokenLink[];
}

function socialLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "twitter") return "X / Twitter";
  if (t === "telegram") return "Telegram";
  if (t === "discord") return "Discord";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function useTokenAbout(mint: string | null) {
  return useQuery({
    queryKey: ["token-about", mint],
    queryFn: async (): Promise<TokenAbout> => {
      const [gecko, dex] = await Promise.allSettled([
        fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/info`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`).then((r) => (r.ok ? r.json() : null)),
      ]);

      const description: string | null =
        (gecko.status === "fulfilled" && gecko.value?.data?.attributes?.description?.trim()) || null;

      const links: TokenLink[] = [];
      const seen = new Set<string>();
      const add = (label: string, url?: string | null) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        links.push({ label, url });
      };

      if (dex.status === "fulfilled" && Array.isArray(dex.value)) {
        const info = dex.value.find((p: any) => p?.info)?.info;
        for (const w of info?.websites ?? []) add(w.label || "Website", w.url);
        for (const s of info?.socials ?? []) add(socialLabel(s.type ?? "Link"), s.url);
      }
      // GeckoTerminal fills in when DexScreener has no profile for the token
      if (links.length === 0 && gecko.status === "fulfilled") {
        const a = gecko.value?.data?.attributes;
        for (const w of a?.websites ?? []) add("Website", w);
        if (a?.twitter_handle) add("X / Twitter", `https://twitter.com/${a.twitter_handle}`);
        if (a?.telegram_handle) add("Telegram", `https://t.me/${a.telegram_handle}`);
        add("Discord", a?.discord_url);
      }

      return { description, links };
    },
    enabled: !!mint,
    staleTime: 10 * 60_000,
  });
}
