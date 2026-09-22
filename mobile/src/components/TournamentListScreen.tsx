import { FlatList, RefreshControl, Share, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState, useCallback, useEffect, useMemo } from "react";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { PublicKey } from "@solana/web3.js";
import { useTournaments, useMyEnteredTournaments, type TournamentAccount } from "../pumpfantasy/hooks";
import { useTournamentMeta, PAYOUT_CHOICES, type TournamentMeta } from "../pumpfantasy/customTournaments";
import { useAuthorization } from "../utils/useAuthorization";
import { formatDuration, formatCountdown } from "../pumpfantasy/format";
import { currencyForMint, decimalsForMint, formatAmountCompact } from "../pumpfantasy/currency";
import { tournamentDisplayName } from "../pumpfantasy/tournamentNames";
import { getTournamentPhase, type TournamentPhase } from "../pumpfantasy/tournamentPhase";
import { payoutStructureOf, poolOf } from "../pumpfantasy/tournamentFilters";
import { WORKER_URL } from "../pumpfantasy/config";
import { ModeBadges, PayoutBadge } from "./ModeBadge";
import { TournamentInfoModal } from "./TournamentInfoModal";
import { useTournamentFilters } from "./TournamentFiltersContext";
import { applyTournamentFilters, isDefaultFilters } from "../pumpfantasy/tournamentFilters";
import type { RootStackParamList } from "../navigators/AppNavigator";
import { PF_COLORS as C } from "../theme";

type Row = { publicKey: PublicKey; account: TournamentAccount };

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

  // Tournaments I actually drafted a portfolio into — distinct from "mine" below, which also
  // counts ones I only created. Driving the card's Enter/View button off "mine" would show
  // "View" on a tournament's own creator before they've entered it themselves.
  const entered = useMemo(() => new Set<string>(enteredTournaments ?? []), [enteredTournaments]);

  // "Mine" = tournaments I entered plus the ones I created — for visibility (seeing my own
  // private tournaments) and the "mine" filter scope, not for the per-card Enter/View state.
  const mine = useMemo(() => {
    const s = new Set<string>(entered);
    for (const row of tournaments ?? []) {
      if (me && meta?.[row.account.id.toString()]?.creator === me) s.add(row.publicKey.toBase58());
    }
    return s;
  }, [entered, tournaments, meta, me]);

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

  // The (i) popup is one instance for the whole list, opened on whichever card was tapped.
  const [infoRow, setInfoRow] = useState<Row | null>(null);

  const goTo = useCallback(
    (t: TournamentAccount) => {
      phase === "upcoming"
        ? navigation.navigate("Draft", { tournamentId: t.id.toString() })
        : navigation.navigate("Leaderboard", { tournamentId: t.id.toString() });
    },
    [navigation, phase],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const infoMeta = infoRow ? meta?.[infoRow.account.id.toString()] : undefined;
  const infoShowView = infoRow ? phase !== "upcoming" || (infoRow.account.entryMode === "single" && entered.has(infoRow.publicKey.toBase58())) : false;

  return (
    <>
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
        renderItem={({ item }) => (
          <TournamentCard
            row={item}
            phase={phase}
            now={now}
            meta={meta?.[item.account.id.toString()]}
            alreadyIn={entered.has(item.publicKey.toBase58())}
            onOpenInfo={() => setInfoRow(item)}
            onPressCta={() => goTo(item.account)}
          />
        )}
      />

      <TournamentInfoModal
        row={infoRow}
        meta={infoMeta}
        onClose={() => setInfoRow(null)}
        ctaLabel={
          infoShowView
            ? "View"
            : `Enter · ${infoRow ? formatAmountCompact(infoRow.account.entryFeeLamports, decimalsForMint(infoRow.account.mint)) : ""} ${infoRow ? currencyForMint(infoRow.account.mint) : "SOL"}`
        }
        onPressCta={() => {
          if (infoRow) goTo(infoRow.account);
          setInfoRow(null);
        }}
      />
    </>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function TournamentCard({
  row,
  phase,
  now,
  meta,
  alreadyIn,
  onOpenInfo,
  onPressCta,
}: {
  row: Row;
  phase: TournamentPhase;
  now: number;
  meta: TournamentMeta | undefined;
  alreadyIn: boolean;
  onOpenInfo: () => void;
  onPressCta: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const t = row.account;

  const payout = payoutStructureOf(t, meta ? { [t.id.toString()]: meta } : undefined);
  const payoutLabel = PAYOUT_CHOICES.find((p) => p.key === payout)?.label ?? "50%";
  const name = tournamentDisplayName(t.id, meta);
  const pool = poolOf(t);
  const currency = currencyForMint(t.mint);
  const decimals = decimalsForMint(t.mint);

  const showView = phase !== "upcoming" || (t.entryMode === "single" && alreadyIn);

  let thirdLabel: string;
  let thirdValue: string;
  if (phase === "upcoming") {
    thirdLabel = "Starts in";
    thirdValue = formatCountdown(Number(t.startTs), now);
  } else if (phase === "live") {
    thirdLabel = "Ends in";
    thirdValue = formatCountdown(Number(t.endTs), now);
  } else {
    thirdLabel = "Status";
    thirdValue = t.status === "finalized" ? "Paid out" : t.status === "cancelled" ? "Cancelled" : "Awaiting results";
  }

  const copyLink = async () => {
    const url = `${WORKER_URL}/t/${t.id.toString()}`;
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      Share.share({ message: url });
    }
  };

  // The whole card navigates to the tournament — a nested TouchableRipple (the link and
  // info buttons) claims the touch first, so tapping either of those still does its own
  // thing instead of also navigating.
  return (
    <TouchableRipple style={styles.card} onPress={onPressCta}>
      <View style={styles.cardInner}>
        <View style={styles.row1}>
          <View style={styles.titleWrap}>
            <ModeBadges tournament={t} />
            <PayoutBadge label={payoutLabel} />
            <Text style={styles.cardTitle} numberOfLines={1}>
              {formatAmountCompact(pool, decimals)} {currency} {name}
            </Text>
            {meta?.visibility === "private" ? <FontAwesome6 name="lock" size={11} color={C.textSecondary} /> : null}
          </View>
          <TouchableRipple style={styles.infoButton} borderless onPress={onOpenInfo}>
            <FontAwesome6 name="circle-info" size={17} color={C.textSecondary} />
          </TouchableRipple>
        </View>

        <View style={styles.row2}>
          <View style={styles.statsRow}>
            <StatCell value={String(t.entryCount)} label="Players" />
            <StatCell value={formatDuration(Number(t.endTs - t.startTs))} label="Duration" />
            <StatCell value={thirdValue} label={thirdLabel} />
          </View>
          <TouchableRipple style={styles.linkButton} borderless onPress={copyLink}>
            <FontAwesome6 name={copied ? "check" : "link"} size={13} color={copied ? C.accent2 : C.textSecondary} />
          </TouchableRipple>
          <View style={styles.ctaButton}>
            <Text style={styles.ctaViewText} numberOfLines={1}>
              {showView ? "View" : `${formatAmountCompact(t.entryFeeLamports, decimals)} ${currency}`}
            </Text>
          </View>
        </View>
      </View>
    </TouchableRipple>
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
    padding: 14,
  },
  cardInner: { gap: 12 },
  row1: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { color: C.textPrimary, fontWeight: "700", fontSize: 14, flexShrink: 1 },
  infoButton: { padding: 4, borderRadius: 999 },
  row2: { flexDirection: "row", alignItems: "center", gap: 8 },
  statsRow: { flex: 1, flexDirection: "row" },
  statCell: { flex: 1, gap: 1 },
  statValue: { color: C.textPrimary, fontWeight: "800", fontSize: 14 },
  statLabel: { color: C.textSecondary, fontSize: 10 },
  linkButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.glass,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButton: {
    minWidth: 76,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 999,
    backgroundColor: C.glassStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ctaViewText: { color: C.textPrimary, fontWeight: "800", fontSize: 12.5, includeFontPadding: false },
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
