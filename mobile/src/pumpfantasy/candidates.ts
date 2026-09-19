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
  website?: string;
  twitter?: string;
  telegram?: string;
}

export const CATEGORY_TABS = ["All", "Degen", "Gambler", "Contender", "Veteran", "BlueChip"] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number];

// The 5 real tiers a portfolio is built from — every entry needs exactly
// one pick per tier (no stacking 5 BlueChips), enforced again server-side
// in worker/src/attestation.ts's signAttestation before it'll sign
// anything. Kept separate from CATEGORY_TABS since that one also has the
// browse-only "All" tab.
export const TIER_TABS = ["Degen", "Gambler", "Contender", "Veteran", "BlueChip"] as const;
export type Tier = (typeof TIER_TABS)[number];

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
