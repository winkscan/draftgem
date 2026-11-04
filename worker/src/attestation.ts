import nacl from "tweetnacl";
import type { Env } from "./env";
import { getAllCandidates } from "./tokenDiscovery";

// Signs a short-lived attestation of each picked mint's real fp_cost (its
// volatility group), so `enter_tournament` can verify the budget on-chain without ever
// needing the mint pre-registered as its own account — see
// programs/pumpfantasy/src/instructions/enter_tournament.rs's own comment.
// Same Ed25519-attestation pattern SwapKings already uses in production
// for founder-wallet verification.

const ATTESTATION_TTL_SECONDS = 120; // generous enough to cover picking + confirming, short enough a stale one can't be replayed hours later

export interface AttestedPick {
  mint: string;
  fpCost: number;
  tier: string;
}

export class UnknownMintError extends Error {
  constructor(public mint: string) {
    super(`This coin is not in the tournament list right now: ${mint}. Refresh the list and pick again.`);
  }
}

// Group and price come from the stored volatility measurement — the same
// number the Draft list used — so they normally match what the player saw. If
// the list was fetched just before a group changed (or a coin was measured for
// the first time in between), say so plainly here instead of letting the
// transaction die on-chain with a generic BudgetExceeded.
const MAX_BUDGET_FP = 4_000; // constants::MAX_BUDGET_FP in the Rust program
export class BudgetExceededError extends Error {
  constructor(total: number) {
    super(`Portfolio costs ${total} FP (max ${MAX_BUDGET_FP}). Swap a pick — a coin's group can also change when its volatility is re-measured.`);
  }
}

/**
 * Real fp_cost for each requested mint, computed fresh — never trusts a client-supplied value.
 *
 * Only coins in the browsable pool can be priced: it is the very list the Draft screen and the AI portfolio
 * priced the coins from (shared 10-minute cache), so the signed price matches what the player was shown.
 * Anything else is refused. Signing any mint Jupiter knows would let a player bypass the app and enter with a
 * token of their own in a tiny pool, then move its price at the round's start or end — the pool's liquidity
 * and market-cap floor (tokenDiscovery.ts) is what makes the settlement prices hard to push.
 */
export async function computeFpCosts(mints: string[], env: Env): Promise<AttestedPick[]> {
  const pool = new Map((await getAllCandidates(env)).map((c) => [c.mint, c]));
  return mints.map((mint) => {
    const c = pool.get(mint);
    if (!c) throw new UnknownMintError(mint);
    return { mint, fpCost: c.fpCost, tier: c.tier };
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
