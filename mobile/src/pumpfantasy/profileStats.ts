import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "../utils/ConnectionProvider";
import { ENTRY_DISCRIMINATOR, decodeEntry } from "./accounts";
import { fetchArchivedList, fetchArchivedResult } from "./archive";
import { PROGRAM_ID } from "./config";
import { NATIVE_MINT, decimalsForMint } from "./currency";
import { fetchAllAccountsV2 } from "./gpaV2";
import { useTournaments } from "./hooks";
import { getLivePricesMicros } from "./livePrices";
import { tournamentPda } from "./pdas";

const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const ENTRY_PLAYER_OFFSET = 40;

export interface MyStats {
  /** Won minus entry fees over paid-out tournaments, in USD at today's prices. */
  pnlUsd: number;
  /** Tournaments I entered (on chain now, plus the newest archived ones). */
  tournaments: number;
  /** Of those, the ones running right now. */
  live: number;
  /** Entries that won a prize. */
  wins: number;
  /** Every settled result (unix seconds, USD): the profit/loss chart adds these up over time. */
  events: { t: number; usd: number }[];
}

interface Rec {
  tKey: string;
  status: "open" | "finalized" | "cancelled";
  startTs: number;
  endTs: number;
  fee: bigint;
  mint: string;
  prize: bigint;
}

// The numbers on the profile page. Finished tournaments no longer have entry accounts on chain, so
// they come from the worker's archive (the newest 30, each downloaded once and cached).
export function useMyStats(player: PublicKey | null) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const { data: tournaments } = useTournaments();

  return useQuery({
    queryKey: ["my-stats", player?.toBase58(), tournaments?.length],
    enabled: !!player && !!tournaments,
    refetchInterval: 30_000,
    queryFn: async (): Promise<MyStats> => {
      const me = player!.toBase58();
      const byKey = new Map(tournaments!.map((t) => [t.publicKey.toBase58(), t.account]));
      const recs = new Map<string, Rec>(); // one per entry

      const rows = await fetchAllAccountsV2(connection, PROGRAM_ID, ENTRY_DISCRIMINATOR, decodeEntry, [
        { memcmp: { offset: ENTRY_PLAYER_OFFSET, bytes: bs58.encode(player!.toBuffer()) } },
      ]);
      for (const r of rows) {
        const tKey = r.account.tournament.toBase58();
        const t = byKey.get(tKey);
        if (!t) continue;
        recs.set(tKey + ":" + r.account.entryIndex, {
          tKey,
          status: t.status,
          startTs: Number(t.startTs),
          endTs: Number(t.endTs),
          fee: t.entryFeeLamports,
          mint: t.mint.toBase58(),
          prize: r.account.prizeLamports,
        });
      }

      const recent = (await fetchArchivedList()).slice(0, 30);
      await Promise.all(
        recent.map(async (t) => {
          try {
            const result = await queryClient.fetchQuery({
              queryKey: ["archived-result", t.id],
              queryFn: () => fetchArchivedResult(t.id),
              staleTime: Infinity,
            });
            const tKey = tournamentPda(BigInt(t.id))[0].toBase58();
            for (const e of result?.entries ?? []) {
              if (e.player !== me) continue;
              recs.set(tKey + ":" + e.entryIndex, {
                tKey,
                status: t.status,
                startTs: t.startTs,
                endTs: t.endTs,
                fee: BigInt(t.entryFeeLamports),
                mint: t.mint ?? NATIVE_MINT.toBase58(),
                prize: BigInt(e.prizeLamports),
              });
            }
          } catch {
            // try again on the next refresh
          }
        }),
      );

      const all = [...recs.values()];
      const now = Math.floor(Date.now() / 1000);
      const paid = all.filter((r) => r.status === "finalized"); // cancelled ones were refunded: no gain, no loss

      const priceMints = [...new Set(paid.map((r) => (r.mint === NATIVE_MINT.toBase58() ? WRAPPED_SOL : r.mint)))];
      const prices = priceMints.length > 0 ? await getLivePricesMicros(priceMints).catch(() => ({})) : {};
      let pnlUsd = 0;
      const events: { t: number; usd: number }[] = [];
      for (const r of paid) {
        const micros = (prices as Record<string, bigint>)[r.mint === NATIVE_MINT.toBase58() ? WRAPPED_SOL : r.mint];
        if (micros == null) continue; // no price for this currency right now: leave it out
        const units = Number(r.prize - r.fee) / 10 ** decimalsForMint(new PublicKey(r.mint));
        const usd = units * (Number(micros) / 1_000_000);
        pnlUsd += usd;
        events.push({ t: r.endTs, usd });
      }

      return {
        pnlUsd,
        tournaments: new Set(all.map((r) => r.tKey)).size,
        live: new Set(all.filter((r) => r.status === "open" && now >= r.startTs && now < r.endTs).map((r) => r.tKey)).size,
        wins: all.filter((r) => r.prize > 0n).length,
        events: events.sort((a, b) => a.t - b.t),
      };
    },
  });
}
