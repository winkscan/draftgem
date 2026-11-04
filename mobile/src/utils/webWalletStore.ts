// Browser wallet support (web build only — the Android build never imports this file; it uses MWA).
// Talks to any Wallet Standard wallet the browser has (Phantom, Solflare, Backpack, ...) and keeps the
// connection state in a tiny store the React hooks in useAuthorization.web.tsx / useMobileWallet.web.tsx read.
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import AsyncStorage from "@react-native-async-storage/async-storage";
import bs58 from "bs58";
import { IS_MAINNET } from "../pumpfantasy/config";

export const CHAIN = IS_MAINNET ? ("solana:mainnet" as const) : ("solana:devnet" as const);
const STORAGE_KEY = "draftgem-web-wallet";

export type WebAccount = Readonly<{
  address: string;
  label?: string;
  /** The wallet's own icon (a data URI), shown in the top bar like the account picture on Android. */
  icon?: string;
  publicKey: PublicKey;
}>;

export interface WalletOption {
  name: string;
  icon: string;
}

interface State {
  wallets: WalletOption[];
  account: WebAccount | null;
  /** True until the silent reconnect to the last used wallet has finished. */
  loading: boolean;
  /** The wallet picker is showing. */
  picking: boolean;
}

let state: State = { wallets: [], account: null, loading: true, picking: false };
let activeWallet: Wallet | null = null;
let activeAccount: WalletAccount | null = null;
const listeners = new Set<() => void>();
let pendingPick: { resolve: (a: WebAccount) => void; reject: (e: Error) => void } | null = null;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const getState = () => state;

function solanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => "standard:connect" in w.features && "solana:signAndSendTransaction" in w.features && w.chains.includes(CHAIN));
}

function refreshWallets() {
  setState({ wallets: solanaWallets().map((w) => ({ name: w.name, icon: w.icon })) });
}

function toAccount(wallet: Wallet, acc: WalletAccount): WebAccount {
  return { address: acc.address, label: acc.label, icon: acc.icon ?? wallet.icon, publicKey: new PublicKey(acc.address) };
}

async function connectTo(wallet: Wallet, silent: boolean): Promise<WebAccount> {
  const feature = (wallet.features as any)["standard:connect"];
  const { accounts } = await feature.connect({ silent });
  const acc: WalletAccount | undefined = accounts.find((a: WalletAccount) => a.chains.includes(CHAIN)) ?? accounts[0];
  if (!acc) throw new Error("The wallet returned no account");
  activeWallet = wallet;
  activeAccount = acc;
  const account = toAccount(wallet, acc);
  setState({ account });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, wallet.name);
  } catch {}
  // The user can switch accounts or lock the wallet from the extension itself: follow it.
  const events = (wallet.features as any)["standard:events"];
  if (events) {
    events.on("change", ({ accounts: next }: { accounts?: readonly WalletAccount[] }) => {
      if (activeWallet !== wallet || !next) return;
      if (next.length === 0) {
        void forget();
      } else if (next[0].address !== activeAccount?.address) {
        activeAccount = next[0];
        setState({ account: toAccount(wallet, next[0]) });
      }
    });
  }
  return account;
}

/** Try to reconnect, without a popup, to the wallet used last time. */
async function restore() {
  try {
    const name = await AsyncStorage.getItem(STORAGE_KEY);
    if (!name) return;
    // Wallet extensions register a moment after the page loads: give them a short grace period.
    for (let i = 0; i < 10 && !solanaWallets().some((w) => w.name === name); i++) await new Promise((r) => setTimeout(r, 200));
    const wallet = solanaWallets().find((w) => w.name === name);
    if (wallet) await connectTo(wallet, true);
  } catch {
    // Not authorized any more (or the wallet is locked): stay signed out.
  } finally {
    setState({ loading: false });
  }
}

if (typeof window !== "undefined") {
  const wallets = getWallets();
  wallets.on("register", refreshWallets);
  wallets.on("unregister", refreshWallets);
  refreshWallets();
  void restore();
} else {
  state = { ...state, loading: false };
}

/** Forget the wallet locally (the browser wallet keeps its own site permission). */
async function forget() {
  activeWallet = null;
  activeAccount = null;
  setState({ account: null });
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Opens the wallet picker and resolves with the account once the user connects one. */
export function connectWallet(): Promise<WebAccount> {
  if (state.account) return Promise.resolve(state.account);
  return new Promise((resolve, reject) => {
    pendingPick?.reject(new Error("Wallet selection cancelled"));
    pendingPick = { resolve, reject };
    refreshWallets();
    setState({ picking: true });
  });
}

export async function pickWallet(name: string): Promise<void> {
  const wallet = solanaWallets().find((w) => w.name === name);
  if (!wallet || !pendingPick) return;
  const pending = pendingPick;
  try {
    const account = await connectTo(wallet, false);
    pendingPick = null;
    setState({ picking: false });
    pending.resolve(account);
  } catch (e: any) {
    // Keep the picker open so the user can try another wallet; surface the reason to whoever is waiting only on cancel.
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export function cancelPick() {
  setState({ picking: false });
  pendingPick?.reject(new Error("Wallet selection cancelled"));
  pendingPick = null;
}

export async function disconnectWallet(): Promise<void> {
  const wallet = activeWallet;
  try {
    const feature = (wallet?.features as any)?.["standard:disconnect"];
    if (feature) await feature.disconnect();
  } catch {}
  await forget();
}

export async function clearWallet(): Promise<void> {
  await forget();
}

export async function signAndSend(transaction: Transaction | VersionedTransaction, minContextSlot: number): Promise<string> {
  if (!activeWallet || !activeAccount) await connectWallet();
  const wallet = activeWallet!;
  const account = activeAccount!;
  const bytes =
    transaction instanceof Transaction
      ? transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
      : transaction.serialize();
  const feature = (wallet.features as any)["solana:signAndSendTransaction"];
  const [out] = await feature.signAndSendTransaction({
    account,
    chain: CHAIN,
    transaction: bytes,
    options: { minContextSlot },
  });
  return bs58.encode(out.signature);
}

export async function signMessageWith(message: Uint8Array): Promise<Uint8Array> {
  if (!activeWallet || !activeAccount) await connectWallet();
  const feature = (activeWallet!.features as any)["solana:signMessage"];
  if (!feature) throw new Error("This wallet cannot sign messages");
  const [out] = await feature.signMessage({ account: activeAccount, message });
  return out.signature;
}
