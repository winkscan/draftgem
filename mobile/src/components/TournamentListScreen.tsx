import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple, Chip } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, useCallback, useEffect, useMemo } from "react";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useTournaments, useMyEnteredTournaments } from "../pumpfantasy/hooks";
import { useTournamentMeta } from "../pumpfantasy/customTournaments";
import { useAuthorization } from "../utils/useAuthorization";
import { formatSol, formatCountdown } from "../pumpfantasy/format";
import { getTournamentPhase, type TournamentPhase } from "../pumpfantasy/tournamentPhase";
import { ModeBadges } from "./ModeBadge";
import { useTournamentFilters } from "./TournamentFiltersContext";
import { applyTournamentFilters, isDefaultFilters } from "../pumpfantasy/tournamentFilters";
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
  // Ticking clock: which phase a tournament is in depends on the time, but a
  // tournament nobody has entered never changes on chain, so nothing else would
  // re-render the list when its start passes (it would sit in the Lobby
  // forever). Also keeps the "Starts in / Ends in" countdowns moving.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const { filters, reset } = useTournamentFilters();
  // Names and public/private of player-made tournaments (cron-made ones have no entry here).
  const { data: meta } = useTournamentMeta();
  const me = selectedAccount?.publicKey.toBase58();

  // "Mine" = tournaments I entered plus the ones I created.
  const mine = useMemo(() => {
    const s = new Set<string>(enteredTournaments ?? []);
    for (const row of tournaments ?? []) {
      if (me && meta?.[row.account.id.toString()]?.creator === me) s.add(row.publicKey.toBase58());
    }
    return s;
  }, [enteredTournaments, tournaments, meta, me]);

  const inPhase = useMemo(
    () =>
      (tournaments ?? []).filter((row) => {
        if (getTournamentPhase(row.account, now) !== phase) return false;
        // Private tournaments are unlisted: only their creator and the players who
        // joined (through the shared link) see them here.
        if (meta?.[row.account.id.toString()]?.visibility === "private" && !mine.has(row.publicKey.toBase58())) {
          return false;
        }
        // Nobody entered: it never really starts, so it doesn't appear in Live
        // or Results (there's no one to score). It stays visible in the Lobby
        // while entries are still open.
        return phase === "upcoming" || row.account.entryCount > 0;
      }),
    [tournaments, phase, now, meta, mine],
  );
  // The header's filters (scope / payout / sort / entry type) on top of the phase.
  const filtered = useMemo(
    () => applyTournamentFilters(inPhase, filters, phase, mine, meta),
    [inPhase, filters, phase, mine, meta],
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
          {inPhase.length > 0 || !isDefaultFilters(filters) ? (
            <>
              <Text style={styles.emptyText}>
                {filters.scope === "mine" && !selectedAccount
                  ? "Connect your wallet to see the tournaments you entered."
                  : "No tournaments match these filters."}
              </Text>
              {!isDefaultFilters(filters) ? (
                <TouchableRipple style={styles.resetButton} borderless onPress={reset}>
                  <Text style={styles.resetText}>Reset filters</Text>
                </TouchableRipple>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>{emptyText}</Text>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const t = item.account;
        let label: string;
        if (phase === "upcoming") label = `Starts in ${formatCountdown(Number(t.startTs), now)}`;
        else if (phase === "live") label = `Ends in ${formatCountdown(Number(t.endTs), now)}`;
        else if (t.status === "finalized") label = "Paid out";
        else if (t.status === "cancelled") label = "Cancelled · refunded";
        else label = "Awaiting results";

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
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {meta?.[t.id.toString()]?.name ?? `Fantasy Tournament #${t.id.toString()}`}
                  </Text>
                  {meta?.[t.id.toString()]?.visibility === "private" ? (
                    <FontAwesome6 name="lock" size={11} color={C.textSecondary} />
                  ) : null}
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
  emptyText: { color: C.textSecondary, textAlign: "center" },
  resetButton: {
    marginTop: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.accent,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  resetText: { color: C.accentText, fontWeight: "700", fontSize: 13 },
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
  viewChipText: { color: "#000000", fontSize: 11, fontWeight: "700" },
  cardStats: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statText: { color: C.textSecondary, fontSize: 12 },
  statDot: { color: C.textSecondary },
  statAccent: { color: C.accentText, fontWeight: "700" },
  debugBox: {
    backgroundColor: C.errorTint,
    borderColor: C.error,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  debugTitle: { color: C.error, fontWeight: "700", fontSize: 12 },
  debugText: { color: C.error, fontSize: 11, marginTop: 4 },
});
