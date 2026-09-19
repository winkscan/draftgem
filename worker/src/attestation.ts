import nacl from "tweetnacl";
import type { Env } from "./env";
import { tierForMarketCap } from "./tokenDiscovery";
import { effectiveMarketCap, loadUnderlyingMarketCaps } from "./bridgedAssets";

// Signs a short-lived attestation of each picked mint's real fp_cost (age
// tier), so `enter_tournament` can verify the budget on-chain without ever
// needing the mint pre-registered as its own account — see
// programs/pumpfantasy/src/instructions/enter_tournament.rs's own comment.
// Same Ed25519-attestation pattern SwapKings already uses in production
// for founder-wallet verification.

const ATTESTATION_TTL_SECONDS = 120; // generous enough to cover picking + confirming, short enough a stale one can't be replayed hours later

interface JupiterToken {
  id: string;
  usdPrice?: number;
  mcap?: number;
}

async function lookupMints(mints: string[]): Promise<Map<string, JupiterToken>> {
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(",")}`);
  const data = res.ok ? ((await res.json()) as JupiterToken[]) : [];
  const byMint = new Map<string, JupiterToken>();
  for (const t of data) byMint.set(t.id, t);
  return byMint;
}

export interface AttestedPick {
  mint: string;
  fpCost: number;
  tier: string;
}

export class UnknownMintError extends Error {
  constructor(public mint: string) {
    super(`Unknown or unpriced mint: ${mint}`);
  }
}

// A coin's tier follows its live market cap, so a pick near a boundary can
// cost more at /attest than the Draft list showed. Say so plainly here instead
// of letting the transaction die on-chain with a generic BudgetExceeded.
const MAX_BUDGET_FP = 4_000; // constants::MAX_BUDGET_FP in the Rust program
export class BudgetExceededError extends Error {
  constructor(total: number) {
    super(`Portfolio costs ${total} FP (max ${MAX_BUDGET_FP}). Swap a pick — a coin's category can also shift with its live market cap.`);
  }
}

/** Real fp_cost for each requested mint, computed fresh — never trusts a client-supplied value. */
export async function computeFpCosts(mints: string[], env: Env): Promise<AttestedPick[]> {
  const [byMint, underlying] = await Promise.all([lookupMints(mints), loadUnderlyingMarketCaps(env)]);
  return mints.map((mint) => {
    const token = byMint.get(mint);
    if (!token || !token.mcap) throw new UnknownMintError(mint);
    const tier = tierForMarketCap(effectiveMarketCap(mint, token.mcap, underlying));
    return { mint, fpCost: tier.fpCost, tier: tier.name };
  });
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function i64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(n), true);
  return b;
}
function base58ToBytes(s: string): Uint8Array {
  // Minimal base58 decoder (no extra dependency) — mint addresses only,
  // always valid base58, so no error handling needed beyond what throws.
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base58 character in mint: ${s}`);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

/** Same byte layout enter_tournament.rs's `attestation_message` reconstructs. */
export function buildAttestationMessage(picks: AttestedPick[], expiryUnixSeconds: number): Uint8Array {
  const parts: Uint8Array[] = [i64le(expiryUnixSeconds)];
  for (const pick of picks) {
    parts.push(base58ToBytes(pick.mint));
    parts.push(u32le(pick.fpCost));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export interface Attestation {
  picks: AttestedPick[];
  expiry: number;
  message: number[]; // plain array so it JSON-serializes cleanly to the client
  signature: number[];
  publicKey: number[];
}

/** `attestationSecretKey` is the raw 64-byte Ed25519 secret key (same format as a Solana CLI keypair file). */
export async function signAttestation(mints: string[], attestationSecretKey: Uint8Array, env: Env): Promise<Attestation> {
  if (mints.length !== 5) throw new Error("Exactly 5 mints required");
  const picks = await computeFpCosts(mints, env);
  const totalFp = picks.reduce((sum, p) => sum + p.fpCost, 0);
  if (totalFp > MAX_BUDGET_FP) throw new BudgetExceededError(totalFp);
  const expiry = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
  const message = buildAttestationMessage(picks, expiry);
  const signature = nacl.sign.detached(message, attestationSecretKey);
  const publicKey = attestationSecretKey.slice(32, 64); // Ed25519 secret key format is seed(32) + pubkey(32)
  return {
    picks,
    expiry,
    message: Array.from(message),
    signature: Array.from(signature),
    publicKey: Array.from(publicKey),
  };
}
