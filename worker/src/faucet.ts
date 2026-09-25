import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "./env";
import { CURRENCIES, TOKEN_PROGRAM_ID, createAtaIdempotentIx, getAssociatedTokenAddress } from "./currency";
import { loadAuthority, sendAndConfirm } from "./syncPrices";
import { rpcUrl } from "./rpc";

// DEVNET ONLY. Real SKR can't be minted, so on devnet the platform key owns a test SKR mint (same 6
// decimals) and this hands a few thousand to any wallet that asks, so a player can try the game.
// On mainnet SKR is bought or earned: remove this route and the mint authority with it.

const CLAIM_AMOUNT = 2_000_000_000n; // 2,000 SKR (6 decimals)
const COOLDOWN_SECONDS = 6 * 3600;
const DAILY_CAP = 300;

export class FaucetError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function claimTestSkr(env: Env, walletStr: unknown): Promise<{ signature: string; amount: number }> {
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(String(walletStr));
  } catch {
    throw new FaucetError("Invalid wallet address", 400);
  }
  const mint = CURRENCIES.SKR.mint!;
  const claimedKey = "faucet:" + wallet.toBase58();
  if (await env.CACHE.get(claimedKey)) throw new FaucetError("Test SKR was already claimed recently — try again in a few hours", 429);
  const day = new Date().toISOString().slice(0, 10);
  const countKey = "faucet-count:" + day;
  const used = Number((await env.CACHE.get(countKey)) ?? "0");
  if (used >= DAILY_CAP) throw new FaucetError("The test faucet is empty for today — try again tomorrow", 429);
  await env.CACHE.put(claimedKey, "1", { expirationTtl: COOLDOWN_SECONDS });
  await env.CACHE.put(countKey, String(used + 1), { expirationTtl: 2 * 24 * 3600 });

  const authority = loadAuthority(env.AUTHORITY_SECRET_KEY);
  const connection = new Connection(rpcUrl(env), "confirmed");
  const ata = getAssociatedTokenAddress(wallet, mint);
  const data = Buffer.alloc(9);
  data[0] = 7; // MintTo
  data.writeBigUInt64LE(CLAIM_AMOUNT, 1);
  const mintTo = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  try {
    const signature = await sendAndConfirm(connection, authority, [createAtaIdempotentIx(authority.publicKey, wallet, mint), mintTo]);
    return { signature, amount: Number(CLAIM_AMOUNT / 1_000_000n) };
  } catch (err) {
    await env.CACHE.delete(claimedKey); // nothing was sent: let them try again
    throw new FaucetError(err instanceof Error ? err.message : "Could not send test SKR", 500);
  }
}
