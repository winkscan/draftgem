import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "./env";
import { CURRENCIES, TOKEN_PROGRAM_ID, createAtaIdempotentIx, getAssociatedTokenAddress, readTokenAmount, type Currency } from "./currency";
import { loadAuthority, sendAndConfirm } from "./syncPrices";

// The platform's revenue (its 5% of every pool) is paid to the worker's key by `withdraw_fees`. That key is a
// hot key living in Cloudflare, so it must not become a piggy bank: after each pass this moves every token
// balance it holds to the owner's own wallet (TREASURY_WALLET), at most once an hour. Nothing is ever swept
// when TREASURY_WALLET is not set (devnet).

const SWEEP_EVERY_MS = 3600_000;

function transferIx(source: PublicKey, destination: PublicKey, owner: PublicKey, amount: bigint): TransactionInstruction {
  const data = Buffer.alloc(9);
  data[0] = 3; // Transfer
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export async function sweepTreasury(env: Env, connection: Connection): Promise<string> {
  if (!env.TREASURY_WALLET) return "no treasury set";
  const treasury = new PublicKey(env.TREASURY_WALLET);
  const last = Number((await env.CACHE.get("treasury-swept-at")) ?? "0");
  if (Date.now() - last < SWEEP_EVERY_MS) return "swept recently";

  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const swept: string[] = [];
  for (const currency of Object.keys(CURRENCIES) as Currency[]) {
    const mint = CURRENCIES[currency].mint;
    if (!mint) continue; // native SOL stays: it pays the fees
    const source = getAssociatedTokenAddress(authority.publicKey, mint);
    const info = await connection.getAccountInfo(source);
    if (!info) continue;
    const amount = readTokenAmount(info.data);
    if (amount === 0n) continue;
    const destination = getAssociatedTokenAddress(treasury, mint);
    await sendAndConfirm(connection, authority, [
      createAtaIdempotentIx(authority.publicKey, treasury, mint),
      transferIx(source, destination, authority.publicKey, amount),
    ]);
    swept.push(currency + " " + amount);
  }
  await env.CACHE.put("treasury-swept-at", String(Date.now()));
  return swept.length > 0 ? "swept " + swept.join(", ") : "nothing to sweep";
}
