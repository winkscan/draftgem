import { createContext, ReactNode, useContext, useMemo } from "react";
import { CLUSTER as NET, RPC_ENDPOINT } from "../../pumpfantasy/config";

// Single fixed cluster (devnet, see pumpfantasy/config.ts) — no switcher.
// SwapKings hit a real bug from offering a cluster picker with only one
// real entry (the radio-group value comparison silently never matched), so
// this app doesn't build one until there's an actual second cluster to
// switch to.
export interface Cluster {
  name: string;
  endpoint: string;
}

const CLUSTER: Cluster = { name: NET === "devnet" ? "devnet" : "mainnet-beta", endpoint: RPC_ENDPOINT };

export interface ClusterProviderContext {
  selectedCluster: Cluster;
  getExplorerUrl(path: string): string;
}

const Context = createContext<ClusterProviderContext>({} as ClusterProviderContext);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const value: ClusterProviderContext = useMemo(
    () => ({
      selectedCluster: CLUSTER,
      getExplorerUrl: (path: string) => `https://explorer.solana.com/${path}${NET === "devnet" ? "?cluster=devnet" : ""}`,
    }),
    [],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCluster() {
  return useContext(Context);
}
