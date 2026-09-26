// One switch for the whole app: which Solana network it talks to. "mainnet" is the real thing (real SKR,
// the beta); flip to "devnet" to develop against the test network and its test SKR. Everything network
// specific below (worker, RPC, platform key, mints elsewhere) follows this.
import idl from "./idl/pumpfantasy.json";
import { PublicKey } from "@solana/web3.js";

export const NETWORK = "mainnet" as "devnet" | "mainnet";
export const IS_MAINNET = NETWORK === "mainnet";
// Can players create their own tournaments? (The worker enforces the same switch and the mainnet fee limits.)
export const PLAYER_TOURNAMENTS = true;
export const CLUSTER = (IS_MAINNET ? "mainnet-beta" : "devnet") as "mainnet-beta" | "devnet";

// The Cloudflare Worker of the chosen network: it auto-creates tournaments, serves the coin pool
// (`/candidates`), signs pick attestations (`/attest`), builds AI portfolios and, on mainnet, forwards the
// app's RPC calls to Helius so no API key ships in the app — see worker/src/index.ts.
export const WORKER_URL = IS_MAINNET ? "https://draftgem-mainnet.swapkings.workers.dev" : "https://pumpfantasy-cron.swapkings.workers.dev";
export const RPC_ENDPOINT = IS_MAINNET ? WORKER_URL + "/rpc" : "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey(idl.address);

// The only key whose tournaments the app shows. The program lets anyone create a tournament with
// themselves as its authority, and the authority decides who wins: a stranger's tournament could pay
// the whole pool to its creator. Everything we run (cron and player-made ones) is created by this key.
export const PLATFORM_AUTHORITY = IS_MAINNET ? "27BDSBXfrhUBKXmWppS6VDfjPCMnm7LCEZZXcCmAVHNx" : "6oKrwPZtLyzuzf3Equyijp64FmAouMJSJ9ctGak3dPZR";

// Mirrors constants::MAX_BUDGET_FP / RAKE_BPS / SCORE_FLOOR_BPS in the Rust
// program — keep these in sync if the on-chain constants ever change.
export const MAX_BUDGET_FP = 4_000;
export const PICKS_PER_ENTRY = 5;
export const RAKE_BPS = 500;
export const SCORE_FLOOR_BPS = -10_000;
export const PRICE_SCALE = 1_000_000;
export const BPS_DENOMINATOR = 10_000;
