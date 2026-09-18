import { WORKER_URL } from "./config";

// Mirrors worker/src/attestation.ts's `Attestation` response shape exactly.
// The Worker computes each pick's real fp_cost server-side and signs it —
// the mobile client never invents or trusts its own fp_cost; it only ever
// forwards what the backend attested (see actions.ts's enterTournament for
// how this becomes the on-chain Ed25519Program instruction).
export interface AttestedPick {
  mint: string;
  fpCost: number;
  tier: string;
}

export interface Attestation {
  picks: AttestedPick[];
  expiry: number;
  message: number[];
  signature: number[];
  publicKey: number[];
}

export async function fetchAttestation(mints: string[]): Promise<Attestation> {
  const res = await fetch(`${WORKER_URL}/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mints }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Attestation failed (${res.status})`);
  }
  return res.json();
}
