import { PublicKey, type Connection } from "@solana/web3.js";
import bs58 from "bs58";

// Cheaper getProgramAccounts variant (same filters/semantics, lower RPC-
// provider cost per call) — carried over from the SwapKings codebase, which
// confirmed this against Helius's own billing docs. Kept generic/provider-
// agnostic here; devnet's public RPC doesn't bill per-call, but this app
// will eventually run against the same kind of paid RPC SwapKings uses, so
// call sites go through this from day one instead of `program.account.<x>.all()`.
export interface RawProgramAccount {
  pubkey: PublicKey;
  data: Buffer;
}

export interface GpaV2Filter {
  memcmp?: { offset: number; bytes: string };
  dataSize?: number;
}

async function getProgramAccountsV2(
  connection: Connection,
  programId: PublicKey,
  filters: GpaV2Filter[],
): Promise<RawProgramAccount[]> {
  const all: RawProgramAccount[] = [];
  let paginationKey: string | undefined;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccountsV2",
        params: [
          programId.toBase58(),
          { encoding: "base64", filters, limit: 10_000, ...(paginationKey ? { paginationKey } : {}) },
        ],
      }),
    });
    if (!res.ok) {
      // Not every RPC provider implements getProgramAccountsV2 (it's a
      // Helius-specific method name) — devnet's public endpoint doesn't, so
      // fall back to the classic method there rather than hard-failing.
      return getProgramAccountsClassic(connection, programId, filters);
    }
    const json = (await res.json()) as {
      result?: { accounts: { pubkey: string; account: { data: [string, string] } }[]; paginationKey: string | null };
      error?: { message: string };
    };
    if (json.error) {
      return getProgramAccountsClassic(connection, programId, filters);
    }
    const { accounts, paginationKey: nextKey } = json.result!;
    for (const { pubkey, account } of accounts) {
      all.push({ pubkey: new PublicKey(pubkey), data: Buffer.from(account.data[0], "base64") });
    }
    if (accounts.length === 0 || !nextKey) break;
    paginationKey = nextKey;
  }
  return all;
}

async function getProgramAccountsClassic(
  connection: Connection,
  programId: PublicKey,
  filters: GpaV2Filter[],
): Promise<RawProgramAccount[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    encoding: "base64",
    filters: filters as any,
  });
  return accounts.map(({ pubkey, account }) => ({ pubkey, data: account.data as unknown as Buffer }));
}

/**
 * Fetches every account of one type owned by `programId`, filtered by its
 * 8-byte discriminator (pass the constant from accounts.ts — not computed
 * at runtime, see binary.ts for why) plus any extra memcmp/dataSize
 * filters, and decodes each with `decode`.
 */
export async function fetchAllAccountsV2<T>(
  connection: Connection,
  programId: PublicKey,
  discriminator: Buffer,
  decode: (data: Buffer) => T,
  extraFilters: GpaV2Filter[] = [],
): Promise<{ publicKey: PublicKey; account: T }[]> {
  const allFilters: GpaV2Filter[] = [
    { memcmp: { offset: 0, bytes: bs58.encode(discriminator) } },
    ...extraFilters,
  ];

  // getProgramAccountsV2 only exists on Helius-flavored RPCs — anywhere
  // else (devnet's public endpoint, a raw validator) it can fail in ways
  // that aren't a clean HTTP/JSON-RPC error (a dropped connection, a
  // timeout, a non-JSON body). Any failure here — not just a well-formed
  // "method not found" — falls back to the always-supported classic
  // method, so a flaky V2 attempt can never leave callers with a silently
  // empty result.
  let raw: RawProgramAccount[];
  try {
    raw = await getProgramAccountsV2(connection, programId, allFilters);
  } catch {
    raw = await getProgramAccountsClassic(connection, programId, allFilters);
  }

  // A row that fails to decode (e.g. an older account created before a
  // field was added to this struct's layout, still sitting on-chain from
  // earlier dev/test runs) is skipped rather than thrown — one stale
  // account shouldn't blank out the whole list for everything created
  // after it. Confirmed necessary the first time a Tournament field was
  // added: old, shorter accounts made every fetch throw mid-`.map()`.
  const out: { publicKey: PublicKey; account: T }[] = [];
  for (const { pubkey, data } of raw) {
    try {
      out.push({ publicKey: pubkey, account: decode(data) });
    } catch {
      // skip
    }
  }
  return out;
}

export async function fetchOneAccount<T>(
  connection: Connection,
  address: PublicKey,
  decode: (data: Buffer) => T,
): Promise<T | null> {
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  return decode(info.data);
}
