import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple, Chip } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, useCallback, useMemo } from "react";
import { useTournaments, useMyEnteredTournaments } from "../pumpfantasy/hooks";
import { useAuthorization } from "../utils/useAuthorization";
import { formatSol, formatCountdown } from "../pumpfantasy/format";
import { getTournamentPhase, type TournamentPhase } from "../pumpfantasy/tournamentPhase";
import { ModeBadges } from "./ModeBadge";
import type { RootStackParamList } from "../navigators/AppNavigator";
import { PF_COLORS as C } from "../theme";

// Shared by Lobby/Live/Results — same card list, filtered to one time-based
// phase (see tournamentPhase.ts). A tournament moves phases purely by
// start_ts/end_ts, not by whether an admin has run finalize_tournament yet.
export function TournamentListScreen({ phase, emptyText }: { phase: TournamentPhase; emptyText: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: tournaments, isLoading, isError, error, refetch } = useTournaments();
  const { selectedAccount } = useAuthorization();
  const { data: enteredTournaments } = useMyEnteredTournaments(selectedAccount?.publicKey ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const now = Math.floor(Date.now() / 1000);

  const filtered = useMemo(
    () => (tournaments ?? []).filter((row) => getTournamentPhase(row.account, now) === phase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tournaments, phase],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={filtered}
      keyExtractor={(row) => row.publicKey.toBase58()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      ListHeaderComponent={
        isError ? (
          <View style={styles.debugBox}>
            <Text style={styles.debugTitle}>Fetch failed</Text>
            <Text style={styles.debugText}>{error instanceof Error ? error.message : String(error)}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={{ color: C.textSecondary }}>{emptyText}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const t = item.account;
        let label: string;
        if (phase === "upcoming") label = `Starts in ${formatCountdown(Number(t.startTs), now)}`;
        else if (phase === "live") label = `Ends in ${formatCountdown(Number(t.endTs), now)}`;
        else label = t.status === "finalized" ? "Finalized" : "Awaiting results";

        // Live and Results are always "View" — entries are closed the
        // moment a round leaves "upcoming", full stop, whether or not you
        // ever entered it (a tournament you never joined must not offer a
        // red "Entry" CTA once it's no longer joinable). Within "upcoming"
        // the entry-fee CTA stays live mode-permitting: Single mode swaps
        // to View the moment you're in (only one entry ever possible);
        // Multiple mode keeps offering Entry so more portfolios can be
        // added right up to the close.
        const alreadyIn = !!enteredTournaments?.has(item.publicKey.toBase58());
        const showView = phase !== "upcoming" || (t.entryMode === "single" && alreadyIn);

        return (
          <TouchableRipple
            style={styles.card}
            onPress={() =>
              phase === "upcoming"
                ? navigation.navigate("Draft", { tournamentId: t.id.toString() })
                : navigation.navigate("Leaderboard", { tournamentId: t.id.toString() })
            }
          >
            <View>
              <View style={styles.cardTop}>
                <View style={styles.titleRow}>
                  <ModeBadges tournament={t} />
                  <Text style={styles.cardTitle}>Fantasy Tournament #{t.id.toString()}</Text>
                </View>
                {showView ? (
                  <Chip compact style={styles.viewChip} textStyle={styles.viewChipText}>
                    View
                  </Chip>
                ) : (
                  <Chip compact style={styles.entryChip} textStyle={styles.entryChipText}>
                    {formatSol(t.entryFeeLamports, 2)} SOL Entry
                  </Chip>
                )}
              </View>
              <View style={styles.cardStats}>
                <Text style={styles.statText}>{t.entryCount} players</Text>
                <Text style={styles.statDot}>·</Text>
                <Text style={styles.statText}>{t.assetCount} coins</Text>
                <Text style={styles.statDot}>·</Text>
                <Text style={[styles.statText, phase !== "results" ? styles.statAccent : undefined]}>{label}</Text>
              </View>
            </View>
          </TouchableRipple>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  list: { flex: 1, backgroundColor: C.bg },
  listContent: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  cardTitle: { color: C.textPrimary, fontWeight: "700", fontSize: 15, flexShrink: 1 },
  entryChip: { backgroundColor: C.accent },
  entryChipText: { color: C.accentTextOn, fontSize: 11, fontWeight: "700" },
  viewChip: { backgroundColor: C.textPrimary },
  viewChipText: { color: "#ffffff", fontSize: 11, fontWeight: "700" },
  cardStats: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statText: { color: C.textSecondary, fontSize: 12 },
  statDot: { color: C.textSecondary },
  statAccent: { color: C.accent, fontWeight: "700" },
  debugBox: {
    backgroundColor: "#fff0f0",
    borderColor: C.negative,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  debugTitle: { color: C.negative, fontWeight: "700", fontSize: 12 },
  debugText: { color: C.negative, fontSize: 11, marginTop: 4 },
});
