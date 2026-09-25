import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

// Mirrors worker/src/currency.ts. `mint: null` = native SOL, the contract's own sentinel
// (Pubkey::default()). ORE and USDC addresses are the same on devnet and mainnet.
import { IS_MAINNET } from "./config";

export type Currency = "SKR" | "SOL" | "ORE" | "USDC";

// SKR, the Solana Mobile (Seeker) token, is the platform's main currency (6 decimals). Its real mint is
// on mainnet; on devnet the platform key owns a test mint (worker/src/faucet.ts hands it out).
export const SKR_MINT_MAINNET = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
export const SKR_MINT_DEVNET = "3KQM6MobTX4TZhoLyQgmKmvvexJ7wozY29FFK9rPUZgU";

export const NATIVE_MINT = PublicKey.default;

export const CURRENCIES: Record<Currency, { mint: PublicKey | null; decimals: number }> = {
  SKR: { mint: new PublicKey(IS_MAINNET ? SKR_MINT_MAINNET : SKR_MINT_DEVNET), decimals: 6 },
  SOL: { mint: null, decimals: 9 },
  ORE: { mint: new PublicKey("oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp"), decimals: 11 },
  USDC: { mint: new PublicKey(IS_MAINNET ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), decimals: 6 },
};

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export function mintFor(currency: Currency): PublicKey {
  return CURRENCIES[currency].mint ?? NATIVE_MINT;
}

export function isNativeMint(mint: PublicKey): boolean {
  return mint.equals(NATIVE_MINT);
}

export function currencyForMint(mint: PublicKey): Currency {
  if (isNativeMint(mint)) return "SOL";
  for (const [key, c] of Object.entries(CURRENCIES)) {
    if (c.mint && c.mint.equals(mint)) return key as Currency;
  }
  return "SOL"; // unknown mint: display fallback only
}

export function decimalsForMint(mint: PublicKey): number {
  return CURRENCIES[currencyForMint(mint)].decimals;
}

export function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** AssociatedTokenAccountInstruction::CreateIdempotent — safe to send even if the ATA already exists. */
export function createAtaIdempotentIx(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  const ata = getAssociatedTokenAddress(owner, mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/** Formats a base-unit amount for display, e.g. formatAmount(5_00000000000n, 11) -> "5". */
export function formatAmount(amount: bigint, decimals: number, maxFractionDigits = 4): string {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const frac = amount % scale;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/** Just enough decimals to be readable, no trailing zeros — mirrors format.ts's formatSolCompact,
 * generalized to any mint's own decimals. */
export function formatAmountCompact(amount: bigint, decimals: number): string {
  const scale = 10 ** decimals;
  const value = Number(amount) / scale;
  if (value === 0) return "0";
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : value >= 0.01 ? 3 : 6;
  const s = value.toFixed(digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export function parseAmount(input: string, decimals: number): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 10 ** decimals);
}
