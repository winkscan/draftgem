import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { WORKER_URL } from "./config";
import type { SignAndSend } from "./actions";

// Player-made tournaments ("+" screen). The worker owns the details — see
// worker/src/customTournaments.ts. In short: the player pays a small fee in ONE
// transaction (SOL transfer + a Memo carrying the settings), then tells the
// worker the transaction's signature and the worker creates the tournament.

export type Visibility = "public" | "private";
export type EntryModeChoice = "single" | "multiple";
/** Prize structure: how many top finishers split the pool; PvP is a two-player duel, winner takes all. */
export type PayoutChoice = "top1" | "top3" | "p30" | "p50" | "pvp";

export const PAYOUT_CHOICES: { key: PayoutChoice; label: string; description: string }[] = [
  { key: "top1", label: "Top 1", description: "Winner takes all — only the best portfolio is paid." },
  { key: "top3", label: "Top 3", description: "The three best portfolios split the pool equally." },
  { key: "p30", label: "30%", description: "The top 30% of players split the pool equally." },
  { key: "p50", label: "50%", description: "The top half of players split the pool equally." },
  { key: "pvp", label: "PvP", description: "Head-to-head: two players, the winner takes the pool." },
];

export interface CreateParams {
  name: string;
  visibility: Visibility;
  payout: PayoutChoice;
  entryFeeLamports: number;
  entryMode: EntryModeChoice;
  startInSec: number;
  durationSec: number;
}

export interface CreateInfo {
  feeLamports: number;
  treasury: string;
  available: boolean;
}

export interface CreatedTournament {
  id: string;
  startTs: number;
  endTs: number;
  url: string;
  deepLink: string;
}

export interface TournamentMeta {
  name: string;
  visibility: Visibility;
  payout: PayoutChoice;
  /** The creator's extra cut of the pool, in bps (500 = 5%); 0 for tournaments made before creators could earn it. */
  creatorFeeBps: number;
  creator: string;
}

// Keep in sync with worker/src/customTournaments.ts.
export const NAME_MIN = 3;
export const NAME_MAX = 40;
export const MIN_ENTRY_FEE_SOL = 0.001;
export const MAX_ENTRY_FEE_SOL = 5;
export const ENTRY_FEE_PRESETS_SOL = [0.01, 0.05, 0.1, 0.5, 1];
export const TIME_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 600, label: "10 min" },
  { seconds: 1800, label: "30 min" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 10800, label: "3 hours" },
  { seconds: 21600, label: "6 hours" },
];

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** The exact text the worker expects in the payment's Memo (worker: createMessage). */
export function createTournamentMessage(p: CreateParams & { ts: number; creator: string }): string {
  return [
    "DraftJam: create tournament",
    `name=${p.name}`,
    `visibility=${p.visibility}`,
    `payout=${p.payout}`,
    `fee=${p.entryFeeLamports}`,
    `mode=${p.entryMode}`,
    `start=${p.startInSec}`,
    `duration=${p.durationSec}`,
    `ts=${p.ts}`,
    `creator=${p.creator}`,
  ].join("\n");
}

async function workerJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const fetchCreateInfo = () => workerJson<CreateInfo>("/create-info");

/** Names + public/private of player-made tournaments, keyed by tournament id. */
export function useTournamentMeta() {
  return useQuery({
    queryKey: ["tournament-meta"],
    queryFn: async () => (await workerJson<{ meta: Record<string, TournamentMeta> }>("/tournament-meta")).meta,
    refetchInterval: 30_000,
  });
}

export function useCreateInfo() {
  return useQuery({ queryKey: ["create-info"], queryFn: fetchCreateInfo, staleTime: 60_000 });
}

/**
 * Step 1: one wallet approval that pays the creation fee and records the settings.
 * Returns the payment's signature once it is confirmed on chain.
 */
export async function payCreationFee(
  connection: Connection,
  creator: PublicKey,
  signAndSendTransaction: SignAndSend,
  info: CreateInfo,
  params: CreateParams,
  ts: number,
): Promise<string> {
  const memo = createTournamentMessage({ ...params, ts, creator: creator.toBase58() });
  const transfer = SystemProgram.transfer({
    fromPubkey: creator,
    toPubkey: new PublicKey(info.treasury),
    lamports: info.feeLamports,
  });
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: creator, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const minContextSlot = await connection.getSlot("confirmed");
  const tx = new Transaction({ feePayer: creator, blockhash, lastValidBlockHeight }).add(transfer, memoIx);
  const signature = await signAndSendTransaction(tx, minContextSlot);

  // The worker looks the payment up on chain, so wait until the network has it.
  for (let attempt = 0; attempt < 30; attempt++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error("The payment transaction failed.");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The payment didn't confirm in time. Check your wallet before trying again.");
}

/** Step 2: ask the worker to create the tournament the payment is for. Safe to retry with the same signature. */
export function submitCreate(
  creator: PublicKey,
  params: CreateParams,
  ts: number,
  paymentSignature: string,
): Promise<CreatedTournament> {
  return workerJson<CreatedTournament>("/create-tournament", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, creator: creator.toBase58(), ts, signature: paymentSignature }),
  });
}
