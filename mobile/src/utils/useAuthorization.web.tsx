// Web build: the wallet connection comes from a browser wallet (see webWalletStore.ts), not MWA.
import { useMemo, useSyncExternalStore } from "react";
import { clearWallet, getState, subscribe, type WebAccount } from "./webWalletStore";

export type Account = WebAccount;

export const APP_IDENTITY = {
  name: "DraftGem",
  uri: "https://draftgem.app",
  icon: "assets/favicon.png",
};

export function useAuthorization() {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return useMemo(
    () => ({
      accounts: s.account ? [s.account] : null,
      selectedAccount: s.account,
      isLoading: s.loading,
      clearAuthorization: clearWallet,
    }),
    [s.account, s.loading],
  );
}
