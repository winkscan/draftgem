import { useQuery } from "@tanstack/react-query";
import type { Candidate } from "./candidates";

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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Description sources, in order, first hit wins: GeckoTerminal (~half of
// coins, mostly newer ones), then CoinGecko's contract lookup (established
// coins + some launchpad tokens; free but rate-limited, so it's only asked
// when GeckoTerminal came up empty and a 429 just means "no description").
// Measured 2026-09-19 on 15 sampled coins: GeckoTerminal 7, +CoinGecko a few
// more; DexScreener's API has no description text at all.
async function fetchDescription(mint: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/info`);
    if (r.ok) {
      const d = (await r.json())?.data?.attributes?.description;
      if (typeof d === "string" && d.trim()) return d.trim();
    }
  } catch {}
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/solana/contract/${mint}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
    );
    if (r.ok) {
      const d = (await r.json())?.description?.en;
      if (typeof d === "string") {
        const clean = stripHtml(d);
        if (clean) return clean;
      }
    }
  } catch {}
  return null;
}

export function useTokenAbout(candidate: Candidate | null, enabled: boolean) {
  const mint = candidate?.mint ?? null;
  return useQuery({
    queryKey: ["token-about", mint],
    queryFn: async (): Promise<TokenAbout> => {
      const [description, dex] = await Promise.all([
        fetchDescription(mint!),
        fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      const links: TokenLink[] = [];
      const seen = new Set<string>();
      const add = (label: string, url?: string | null) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        links.push({ label, url });
      };

      // DexScreener first (the user's preferred source), then what Jupiter
      // already gave us in /candidates for whatever DexScreener lacks.
      if (Array.isArray(dex)) {
        const info = dex.find((p: any) => p?.info)?.info;
        for (const w of info?.websites ?? []) add(w.label || "Website", w.url);
        for (const s of info?.socials ?? []) add(socialLabel(s.type ?? "Link"), s.url);
      }
      if (links.length === 0) {
        add("Website", candidate?.website);
        add("X / Twitter", candidate?.twitter);
        add("Telegram", candidate?.telegram);
      }

      return { description, links };
    },
    enabled: !!mint && enabled,
    staleTime: 24 * 60 * 60_000,
  });
}
