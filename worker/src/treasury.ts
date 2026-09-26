import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "./env";
import { CURRENCIES, TOKEN_PROGRAM_ID, createAtaIdempotentIx, getAssociatedTokenAddress, readTokenAmount, type Currency } from "./currency";
import { loadAuthority, sendAndConfirm } from "./syncPrices";

// The platform's revenue (its 5% of every pool) is paid to the worker's key by `withdraw_fees`. That key is a
// hot key living in Cloudflare, so it must not become a piggy bank: after each pass this moves every token
// token balance it holds (and any SOL above a working float) to the owner's own wallet (TREASURY_WALLET), at most
// once an hour. Nothing is ever swept
// when TREASURY_WALLET is not set (devnet).

const SWEEP_EVERY_MS = 3600_000;
// Native SOL: the worker keeps a working float for fees and tournament rent and sends only the excess, so a
// pile of small platform shares is not moved one by one. (Platform shares of SOL tournaments land here.)
const SOL_FLOAT_LAMPORTS = 300_000_000; // 0.3 SOL stays
const SOL_MIN_SWEEP_LAMPORTS = 50_000_000; // move at least 0.05 SOL at a time

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
    if (!mint) continue; // native SOL is handled below
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
  const balance = await connection.getBalance(authority.publicKey);
  const excess = balance - SOL_FLOAT_LAMPORTS;
  if (excess >= SOL_MIN_SWEEP_LAMPORTS) {
    await sendAndConfirm(connection, authority, [SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: treasury, lamports: excess })]);
    swept.push("SOL " + excess);
  }
  await env.CACHE.put("treasury-swept-at", String(Date.now()));
  return swept.length > 0 ? "swept " + swept.join(", ") : "nothing to sweep";
}
