import type { Env } from "./env";
import { setNetwork } from "./currency";

// Which Solana network this worker deployment talks to. One codebase, two deployments: the devnet worker
// (wrangler.toml) and the mainnet one (wrangler.mainnet.toml, NETWORK = "mainnet"), each with its own keys
// and storage.
export type Network = "devnet" | "mainnet";

export function networkOf(env: Env): Network {
  return env.NETWORK === "mainnet" ? "mainnet" : "devnet";
}

/** Called at the top of every entry point so the currency table (SKR / USDC mints) matches the network. */
export function useNetwork(env: Env): Network {
  const n = networkOf(env);
  setNetwork(n);
  return n;
}

export function rpcUrl(env: Env): string {
  return (networkOf(env) === "mainnet" ? "https://mainnet.helius-rpc.com/?api-key=" : "https://devnet.helius-rpc.com/?api-key=") + env.HELIUS_API_KEY;
}

// JSON-RPC methods the app may use through the /rpc proxy (mainnet): reads and sending only. The Helius key
// stays on the server, and nothing that could spend credits wildly (or write) is exposed.
export const RPC_ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getProgramAccountsV2",
  "getBalance",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSlot",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "getParsedTransaction",
  "getFeeForMessage",
  "isBlockhashValid",
  "sendTransaction",
  "simulateTransaction",
]);

/** Forwards an app's JSON-RPC request to Helius if every call in it is on the allow-list. */
export async function proxyRpc(env: Env, body: string): Promise<Response> {
  if (body.length > 64_000) return new Response("Request too large", { status: 413 });
  let calls: unknown;
  try {
    calls = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const list = Array.isArray(calls) ? calls : [calls];
  if (list.length > 20 || !list.every((c) => c && typeof (c as { method?: unknown }).method === "string" && RPC_ALLOWED.has((c as { method: string }).method))) {
    return new Response("Method not allowed", { status: 403 });
  }
  const upstream = await fetch(rpcUrl(env), { method: "POST", headers: { "content-type": "application/json" }, body });
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": "application/json" } });
}
