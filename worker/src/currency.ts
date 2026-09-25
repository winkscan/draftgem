import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

// Hand-rolled, like the rest of this worker (see index.ts's comment on why no
// @coral-xyz/anchor) — rather than add @solana/spl-token as a new dependency for
// three constants and two instruction shapes.
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** AssociatedTokenAccountInstruction::CreateIdempotent (discriminator 1) — safe to send even if the ATA already exists. */
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

/** Reads a raw SPL token account's `amount` field (offset 64, u64 LE) — same layout every token account has. */
export function readTokenAmount(data: Uint8Array): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}

// The tournament currencies the app supports. `mint: null` means native SOL — the
// contract's own sentinel is Pubkey::default() (all-zero), matched via NATIVE_MINT below.
// ORE and USDC addresses are the SAME on devnet and mainnet (real deployed mints, not
// test-only placeholders — confirmed on-chain 2026-09-22: both are classic SPL Token
// program mints, ORE decimals=11, USDC decimals=6).
export type Currency = "SKR" | "SOL" | "ORE" | "USDC";

// SKR, the Solana Mobile (Seeker) token, is the platform's main currency. Real SKR has 6 decimals; its mainnet
// mint is SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3. This worker runs on DEVNET, where the real mint doesn't
// exist, so it uses a test mint owned by the platform key (see faucet.ts). Switch to the mainnet mint together
// with the rest of the mainnet migration.
export const SKR_MINT_MAINNET = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
export const SKR_MINT_DEVNET = "3KQM6MobTX4TZhoLyQgmKmvvexJ7wozY29FFK9rPUZgU";

export const NATIVE_MINT = PublicKey.default;

export const CURRENCIES: Record<Currency, { mint: PublicKey | null; decimals: number; label: string }> = {
  SKR: { mint: new PublicKey(SKR_MINT_DEVNET), decimals: 6, label: "SKR" },
  SOL: { mint: null, decimals: 9, label: "SOL" },
  ORE: { mint: new PublicKey("oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp"), decimals: 11, label: "ORE" },
  USDC: { mint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), decimals: 6, label: "USDC" },
};

export function mintFor(currency: Currency): PublicKey {
  return CURRENCIES[currency].mint ?? NATIVE_MINT;
}

export function currencyForMint(mint: PublicKey): Currency {
  if (mint.equals(NATIVE_MINT)) return "SOL";
  for (const [key, c] of Object.entries(CURRENCIES)) {
    if (c.mint && c.mint.equals(mint)) return key as Currency;
  }
  return "SOL"; // unknown mint: display-only fallback, never used for real accounting
}

export function isNativeMint(mint: PublicKey): boolean {
  return mint.equals(NATIVE_MINT);
}
