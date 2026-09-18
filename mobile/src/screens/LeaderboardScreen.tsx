import { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useTournament, useAssetPrices, useTournamentEntries } from "../pumpfantasy/hooks";
import { useAuthorization } from "../utils/useAuthorization";
import { tournamentPda } from "../pumpfantasy/pdas";
import { useLivePrices } from "../pumpfantasy/livePrices";
import { computeLiveScoreBps } from "../pumpfantasy/liveScore";
import { bpsToPercentLabel, ellipsify } from "../pumpfantasy/format";
import { getTournamentPhase } from "../pumpfantasy/tournamentPhase";
import { ModeBadges } from "../components/ModeBadge";
import { PF_COLORS as C } from "../theme";

// All players' standings in one tournament, live during the round. Prices
// refresh every 25s (see livePrices.ts) — visibly moving without hammering
// either price API, per the user's explicit "not every second, but often
// enough to notice" spec (2026-09-18).
export function LeaderboardScreen() {
  const route = useRoute();
  const { tournamentId } = route.params as { tournamentId: string };
  const id = BigInt(tournamentId);
  const tournamentPubkey = useMemo(() => tournamentPda(id)[0], [tournamentId]);

  const { selectedAccount } = useAuthorization();
  const { data: tournament } = useTournament(id);
  const { data: assets } = useAssetPrices(tournament ? tournamentPubkey : null);
  const { data: entries, isLoading: entriesLoading } = useTournamentEntries(tournament ? tournamentPubkey : null);

  const assetsByMint = useMemo(() => {
    const m = new Map<string, (typeof assets extends (infer T)[] | undefined ? T : never)["account"]>();
    for (const a of assets ?? []) m.set(a.account.mint.toBase58(), a.account);
    return m;
  }, [assets]);

  const now = Math.floor(Date.now() / 1000);
  const phase = tournament ? getTournamentPhase(tournament, now) : "upcoming";
  // Once a tournament is finalized/settled, entries already carry a real
  // on-chain score_bps — no need to keep polling live prices at that point.
  const wantsLivePrices = phase !== "results" || (entries ?? []).some((e) => !e.account.settled);
  const mints = useMemo(() => (assets ?? []).map((a) => a.account.mint.toBase58()), [assets]);
  const { data: livePricesMicros } = useLivePrices(mints, wantsLivePrices);

  const rows = useMemo(() => {
    return (entries ?? [])
      .map((e) => {
        const scoreBps = e.account.settled
          ? e.account.scoreBps
          : livePricesMicros
            ? computeLiveScoreBps(e.account.picks, assetsByMint, livePricesMicros)
            : null;
        return { entry: e, scoreBps };
      })
      .sort((a, b) => (b.scoreBps ?? -Infinity) - (a.scoreBps ?? -Infinity));
  }, [entries, livePricesMicros, assetsByMint]);

  if (!tournament || entriesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <ModeBadges tournament={tournament} />
        <Text style={styles.headerText}>
          {entries?.length ?? 0} portfolio{(entries?.length ?? 0) === 1 ? "" : "s"} · {phase === "live" ? "Live" : "Results"}
        </Text>
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        data={rows}
        keyExtractor={(row) => row.entry.publicKey.toBase58()}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: C.textSecondary }}>No entries in this tournament.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isMe = !!selectedAccount && item.entry.account.player.equals(selectedAccount.publicKey);
          return (
            <View style={[styles.row, isMe ? styles.rowMe : undefined]}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <View style={styles.rowMiddle}>
                <Text style={styles.player} numberOfLines={1}>
                  {isMe ? "You" : ellipsify(item.entry.account.player)}
                  {tournament.entryMode === "multiple" ? ` · #${item.entry.account.entryIndex + 1}` : ""}
                </Text>
                <Text style={styles.fp}>{item.entry.account.fpSpent} FP</Text>
              </View>
              <Text
                style={[
                  styles.score,
                  item.scoreBps == null ? styles.scorePending : item.scoreBps >= 0 ? styles.scoreUp : styles.scoreDown,
                ]}
              >
                {item.scoreBps == null ? "…" : bpsToPercentLabel(item.scoreBps)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, paddingBottom: 8 },
  headerText: { color: C.textSecondary, fontSize: 12 },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
  },
  rowMe: { borderColor: C.accent, backgroundColor: "#fff0f1" },
  rank: { color: C.textSecondary, fontWeight: "700", fontSize: 13, width: 28 },
  rowMiddle: { flex: 1 },
  player: { color: C.textPrimary, fontWeight: "700", fontSize: 13 },
  fp: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  score: { fontWeight: "800", fontSize: 15, minWidth: 64, textAlign: "right" },
  scoreUp: { color: C.positive },
  scoreDown: { color: C.negative },
  scorePending: { color: C.textSecondary },
});
