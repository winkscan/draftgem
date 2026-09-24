import { useQuery } from "@tanstack/react-query";
import { WORKER_URL } from "./config";

// The full off-chain candidate pool the Draft screen browses/searches —
// mirrors worker/src/tokenDiscovery.ts's DiscoveredAsset exactly. Not
// tournament-specific and not pre-registered on-chain; a pick only becomes
// an on-chain AssetPrice once the tournament's entry window locks (see
// worker/src/syncPrices.ts).
export interface Candidate {
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
  /** Typical 1-hour move in %, once this coin has been measured; the group is a stand-in until then. */
  volatilityPct?: number;
  website?: string;
  twitter?: string;
  telegram?: string;
}

// Groups by how much a coin moves, calmest to wildest (worker/src/tiers.ts).
export const CATEGORY_TABS = ["All", "Hold", "Farm", "Pump", "Moon", "Degen"] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number];

export function useCandidates() {
  return useQuery({
    queryKey: ["candidates"],
    queryFn: async (): Promise<Candidate[]> => {
      const res = await fetch(`${WORKER_URL}/candidates`);
      if (!res.ok) throw new Error(`Failed to load coin list (${res.status})`);
      const body = (await res.json()) as { candidates: Candidate[] };
      return body.candidates;
    },
    staleTime: 60_000,
  });
}
