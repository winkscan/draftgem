// Devnet while the program is still being built/tested — no real money at
// risk, and Solana's public devnet faucet is enough for entry-fee-sized test
// transactions. Flip RPC_ENDPOINT (ideally to a paid RPC, same reasoning as
// SwapKings' Helius proxy) and PROGRAM_ID before any real mainnet launch.
import idl from "./idl/pumpfantasy.json";
import { PublicKey } from "@solana/web3.js";

export const RPC_ENDPOINT = "https://api.devnet.solana.com";
export const CLUSTER = "devnet" as const;

// The same Cloudflare Worker that auto-creates tournaments also serves the
// full off-chain candidate pool (`/candidates`) and signs pick attestations
// (`/attest`) — see worker/src/index.ts.
export const WORKER_URL = "https://pumpfantasy-cron.swapkings.workers.dev";

export const PROGRAM_ID = new PublicKey(idl.address);

// Mirrors constants::MAX_BUDGET_FP / RAKE_BPS / SCORE_FLOOR_BPS in the Rust
// program — keep these in sync if the on-chain constants ever change.
export const MAX_BUDGET_FP = 4_000;
export const PICKS_PER_ENTRY = 5;
export const RAKE_BPS = 500;
export const SCORE_FLOOR_BPS = -10_000;
export const PRICE_SCALE = 1_000_000;
export const BPS_DENOMINATOR = 10_000;
