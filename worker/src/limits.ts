import type { Env } from "./env";
import type { Currency } from "./currency";
import { networkOf } from "./rpc";

// Beta safety limits while real money is at stake and the program has had no outside audit: the largest entry
// fee ever created on mainnet, per currency (base units). Applies to the automatic tournaments and to
// player-made ones alike.
export const MAINNET_MAX_ENTRY_FEE: Record<Currency, number> = {
  SKR: 500_000_000, // 500 SKR, about $10
  SOL: 50_000_000, // 0.05 SOL
  ORE: 500_000_000_000, // 5 ORE
  USDC: 10_000_000, // 10 USDC
};

/** The entry-fee ceiling for a currency on this deployment (the wider general range on devnet). */
export function entryFeeCeiling(env: Env, currency: Currency, generalMax: number): number {
  return networkOf(env) === "mainnet" ? Math.min(generalMax, MAINNET_MAX_ENTRY_FEE[currency]) : generalMax;
}

/**
 * Can players create their own tournaments? Always on devnet; on mainnet only while the PLAYER_TOURNAMENTS
 * variable is "on" (a switch in wrangler.mainnet.toml, so it can be turned off in one deploy).
 */
export function playerTournamentsOn(env: Env): boolean {
  return networkOf(env) !== "mainnet" || env.PLAYER_TOURNAMENTS === "on";
}
