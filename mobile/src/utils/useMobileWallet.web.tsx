// Web build: same shape as the Android hook, backed by a browser wallet (see webWalletStore.ts).
import { useMemo } from "react";
import { connectWallet, disconnectWallet, signAndSend, signMessageWith } from "./webWalletStore";

export function useMobileWallet() {
  return useMemo(
    () => ({
      connect: () => connectWallet(),
      signIn: () => connectWallet(),
      disconnect: disconnectWallet,
      signAndSendTransaction: signAndSend,
      signMessage: signMessageWith,
    }),
    [],
  );
}
