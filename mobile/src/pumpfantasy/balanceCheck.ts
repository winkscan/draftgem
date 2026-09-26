import { PublicKey, type Connection } from "@solana/web3.js";
import { assetPda } from "./pdas";
import { currencyForMint, decimalsForMint, formatAmount, getAssociatedTokenAddress, isNativeMint } from "./currency";
import { formatSol } from "./format";

// The wallet can only say "unknown" when a payment fails for lack of funds, so the app checks the balance first
// and explains what is missing. Sizes below are the on-chain account deposits (rent) an entry creates: they come
// back when the tournament is over.
const ENTRY_ACCOUNT_RENT = 1_976_120; // the entry account
const ASSET_ACCOUNT_RENT = 1_270_000; // one per coin nobody has picked in this tournament yet
const NETWORK_FEE_BUFFER = 20_000; // transaction fees and a little slack

async function solBalance(connection: Connection, owner: PublicKey): Promise<number> {
  return connection.getBalance(owner, "confirmed");
}

/** Throws a readable error unless the wallet can pay this entry: the fee, plus the SOL deposits and network fee. */
export async function ensureCanEnter(
  connection: Connection,
  player: PublicKey,
  tournament: PublicKey,
  mint: PublicKey,
  entryFee: bigint,
  pickMints: string[],
): Promise<void> {
  const native = isNativeMint(mint);
  const assets = await connection.getMultipleAccountsInfo(pickMints.map((m) => assetPda(tournament, new PublicKey(m))[0]));
  const newAssets = assets.filter((a) => !a).length;
  const deposits = ENTRY_ACCOUNT_RENT + newAssets * ASSET_ACCOUNT_RENT + NETWORK_FEE_BUFFER;
  const needSol = deposits + (native ? Number(entryFee) : 0);
  const haveSol = await solBalance(connection, player);
  if (haveSol < needSol) {
    throw new Error(
      `Not enough SOL. This entry needs about ${formatSol(needSol, 4)} SOL` +
        (native
          ? ` (the ${formatSol(entryFee, 4)} SOL entry fee plus about ${formatSol(deposits, 4)} SOL of account deposits and network fees, which are returned to you when the tournament ends)`
          : ` for account deposits and network fees, which are returned to you when the tournament ends`) +
        `, but your wallet has ${formatSol(haveSol, 4)} SOL. Add about ${formatSol(needSol - haveSol + 1_000_000, 4)} SOL and try again. Nothing was charged.`,
    );
  }
  if (!native) {
    let have = 0n;
    try {
      have = BigInt((await connection.getTokenAccountBalance(getAssociatedTokenAddress(player, mint))).value.amount);
    } catch {
      // no token account yet: zero
    }
    if (have < entryFee) {
      const symbol = currencyForMint(mint);
      const dec = decimalsForMint(mint);
      throw new Error(
        `Not enough ${symbol}. The entry fee is ${formatAmount(entryFee, dec)} ${symbol}, but your wallet has ${formatAmount(have, dec)} ${symbol}. Nothing was charged.`,
      );
    }
  }
}

/** Throws a readable error unless the wallet holds `lamports` plus a little for the network fee. */
export async function ensureHasSol(connection: Connection, owner: PublicKey, lamports: number, what: string): Promise<void> {
  const need = lamports + NETWORK_FEE_BUFFER;
  const have = await solBalance(connection, owner);
  if (have < need) {
    throw new Error(`Not enough SOL to ${what}: it costs about ${formatSol(need, 4)} SOL, but your wallet has ${formatSol(have, 4)} SOL. Nothing was charged.`);
  }
}
