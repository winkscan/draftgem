import { PublicKey } from "@solana/web3.js";
import { CURRENCIES, SKR_MINT_MAINNET, type Currency } from "../pumpfantasy/currency";
import { SolanaCoin } from "./SolanaIcon";
import { TokenIcon } from "./TokenIcon";

// USDC on devnet is a different mint from the real one, which has no picture of its own: the icon
// is looked up by the mainnet mint.
const ICON_MINT: Record<Exclude<Currency, "SOL">, string> = {
  SKR: SKR_MINT_MAINNET,
  ORE: (CURRENCIES.ORE.mint as PublicKey).toBase58(),
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

/** The picture of a tournament currency (SOL, ORE, USDC), round like the coin icons. */
export function CurrencyIcon({ currency, size = 16 }: { currency: Currency; size?: number }) {
  if (currency === "SOL") return <SolanaCoin size={size} />;
  return <TokenIcon mint={ICON_MINT[currency]} symbol={currency} size={size} />;
}
