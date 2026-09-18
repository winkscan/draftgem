// Shared Env shape — its own module (not declared in index.ts) purely so
// syncPrices.ts can import the type without an index.ts -> syncPrices.ts ->
// index.ts cycle.
export interface Env {
  // The raw JSON byte array a Solana CLI keypair file contains (same
  // format as ~/.config/solana/id.json) for the tournament-creation
  // authority. Set via `wrangler secret put AUTHORITY_SECRET_KEY` — never
  // committed to the repo.
  AUTHORITY_SECRET_KEY: string;
  // Same Helius account/key already used for SwapKings — `wrangler secret
  // put HELIUS_API_KEY`, never committed. Devnet, not mainnet: this worker
  // only ever creates devnet tournaments.
  HELIUS_API_KEY: string;
  // Raw JSON byte array (64-byte Ed25519 secret key, same shape as a
  // Solana CLI keypair file) for the attestation signer generated via
  // `solana-keygen new --outfile attestation-signer.json`. Set via
  // `wrangler secret put ATTESTATION_SIGNER_SECRET_KEY` — never committed;
  // the public half is baked into the on-chain program as
  // constants::ATTESTATION_SIGNER.
  ATTESTATION_SIGNER_SECRET_KEY: string;
}
