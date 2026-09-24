import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ActivityIndicator, Searchbar, Text, TouchableRipple } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useConnection } from "../utils/ConnectionProvider";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useTournament, useMyEntry, useMyEntries, EntryAccount } from "../pumpfantasy/hooks";
import { useCandidates, CATEGORY_TABS, type Candidate, type CategoryTab } from "../pumpfantasy/candidates";
import { fetchAttestation } from "../pumpfantasy/attestation";
import { enterTournament } from "../pumpfantasy/actions";
import { tournamentPda } from "../pumpfantasy/pdas";
import { MAX_BUDGET_FP, PICKS_PER_ENTRY } from "../pumpfantasy/config";
import { currencyForMint, decimalsForMint, formatAmountCompact } from "../pumpfantasy/currency";
import { useTournamentMeta } from "../pumpfantasy/customTournaments";
import { TokenIcon } from "../components/TokenIcon";
import { useChrome } from "../utils/Chrome";
import { TopBar } from "../components/top-bar/TopBar";
import { TournamentInfoModal } from "../components/TournamentInfoModal";
import { ChartModal } from "../components/ChartModal";
import { EmptyState } from "../components/EmptyState";
import { PortfolioCard, SlotCard, entryBadge } from "../components/PortfolioCard";
import { useDraftTab } from "./draftTabStore";
import { PF_COLORS as C } from "../theme";

export function DraftScreen() {
  const route = useRoute();
  const { tournamentId } = route.params as { tournamentId: string };
  const id = BigInt(tournamentId);

  const { connection } = useConnection();
  const { selectedAccount } = useAuthorization();
  const { connect, signAndSendTransaction } = useMobileWallet();
  const queryClient = useQueryClient();

  const tournamentPubkey = useMemo(() => tournamentPda(id)[0], [tournamentId]);

  const { data: tournament } = useTournament(id);
  const { data: candidates, isLoading: candidatesLoading } = useCandidates();
  const { data: tournamentMeta } = useTournamentMeta();
  // Both hooks are called unconditionally (rules of hooks) — only the one
  // matching this tournament's entryMode is actually used below.
  const { data: myEntry } = useMyEntry(tournament ? tournamentPubkey : null, selectedAccount?.publicKey ?? null);
  const { data: myEntries } = useMyEntries(tournament ? tournamentPubkey : null, selectedAccount?.publicKey ?? null);

  const isMultiple = tournament?.entryMode === "multiple";
  const [tab] = useDraftTab(tournamentId);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>("All");
  const [search, setSearch] = useState("");

  // The full pool, so any raw mint an entry stored (this tournament's or an
  // old one's) can still resolve to a symbol/icon/tier for display — not
  // just the ones currently visible under the active category/search.
  const candidatesByMint = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of candidates ?? []) m.set(c.mint, c);
    return m;
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (candidates ?? []).filter((c) => {
      if (categoryTab !== "All" && c.tier !== categoryTab) return false;
      if (!q) return true;
      return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.mint.toLowerCase().includes(q);
    });
  }, [candidates, categoryTab, search]);

  const [picked, setPicked] = useState<Candidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartCandidate, setChartCandidate] = useState<Candidate | null>(null);

  const spentFp = useMemo(() => picked.reduce((sum, c) => sum + c.fpCost, 0), [picked]);
  const remainingFp = MAX_BUDGET_FP - spentFp;

  // Single mode + already entered: show the portfolio you actually built,
  // not just a summary line — resolve the stored raw-mint picks back to
  // their Candidate entries so the same icon/symbol slots render.
  const viewingExistingSingleEntry = !isMultiple && !!myEntry;
  const displayedSlots: (Candidate | undefined)[] = viewingExistingSingleEntry
    ? myEntry!.picks.map((pick) => candidatesByMint.get(pick.toBase58()))
    : Array.from({ length: PICKS_PER_ENTRY }, (_, i) => picked[i]);

  const togglePick = (candidate: Candidate) => {
    setError(null);
    const already = picked.find((p) => p.mint === candidate.mint);
    if (already) {
      setPicked(picked.filter((p) => p.mint !== candidate.mint));
      return;
    }
    if (picked.length >= PICKS_PER_ENTRY) {
      setError(`Only ${PICKS_PER_ENTRY} picks allowed — remove one first.`);
      return;
    }
    if (candidate.fpCost > remainingFp) {
      setError("Not enough FP budget left for this coin.");
      return;
    }
    setPicked([...picked, candidate]);
  };

  const timeClosed = !!tournament && Math.floor(Date.now() / 1000) >= Number(tournament.startTs);
  // PvP is a duel: two players. The contract can't cap entries, so the app keeps a third one out.
  const isDuel = tournamentMeta?.[tournamentId]?.payout === "pvp";
  const duelFull = isDuel && !!tournament && tournament.entryCount >= 2 && !viewingExistingSingleEntry;
  const entriesClosed = timeClosed || duelFull;
  const blockedBySingleEntry = viewingExistingSingleEntry;
  const canSubmit = picked.length === PICKS_PER_ENTRY && !submitting && !entriesClosed && !blockedBySingleEntry;

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      let player = selectedAccount?.publicKey ?? null;
      if (!player) {
        const account = await connect();
        player = account.publicKey;
      }
      const attestation = await fetchAttestation(picked.map((p) => p.mint));
      const entryIndex = isMultiple ? myEntries?.length ?? 0 : 0;
      await enterTournament(connection, player, signAndSendTransaction, id, attestation, entryIndex, tournament?.mint);
      setPicked([]); // clear the drafted picks so Multiple mode can start the next entry right away
      await queryClient.invalidateQueries({ queryKey: ["entry"] });
      await queryClient.invalidateQueries({ queryKey: ["entries"] });
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
    } catch (e: any) {
      setError(e?.message ?? "Entry failed — see wallet for details.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!tournament || candidatesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isMultiple && (tab === "mine" || entriesClosed) ? (
        <MyEntriesList
          entries={myEntries ?? []}
          candidatesByMint={candidatesByMint}
          entriesClosed={entriesClosed}
          tournament={tournament}
        />
      ) : (
        <>
          {viewingExistingSingleEntry ? (
            <View style={styles.portfolioWrap}>
              <PortfolioCard
                portfolioNo={myEntry!.entryIndex + 1}
                badge={entryBadge(tournament)}
                slots={myEntry!.picks.map((pick, i) => ({ key: String(i), candidate: candidatesByMint.get(pick.toBase58()) }))}
              />
            </View>
          ) : (
            <>
              <View style={styles.budgetBar}>
                <Text style={styles.budgetTitle}>Portfolio Budget</Text>
                <Text style={[styles.budgetValue, remainingFp < 0 ? { color: C.error } : undefined]}>
                  {remainingFp} FP
                </Text>
              </View>
              <BudgetBar filled={displayedSlots.filter(Boolean).length} total={PICKS_PER_ENTRY} />

              <View style={styles.slotsRow}>
                {displayedSlots.map((c, i) => (
                  <SlotCard
                    key={i}
                    candidate={c}
                    onRemove={viewingExistingSingleEntry || entriesClosed ? undefined : () => c && togglePick(c)}
                  />
                ))}
              </View>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {viewingExistingSingleEntry ? null : entriesClosed ? (
            <View style={styles.closedBanner}>
              <Text style={{ color: C.textPrimary, fontWeight: "700" }}>
                {duelFull && !timeClosed ? "This duel is full" : "Entries are closed"}
              </Text>
              <Text style={{ color: C.textSecondary, fontSize: 12 }}>
                {duelFull && !timeClosed
                  ? "Two players are already in this head-to-head."
                  : "This tournament's round already started."}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.categoryRow}>
                {CATEGORY_TABS.map((cat) => (
                  <TouchableRipple key={cat} style={styles.categoryTab} onPress={() => setCategoryTab(cat)}>
                    <View style={styles.categoryTabInner}>
                      <Text
                        style={[styles.categoryTabText, categoryTab === cat ? styles.categoryTabTextActive : undefined]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {cat}
                      </Text>
                      <View style={[styles.categoryUnderline, categoryTab === cat ? styles.categoryUnderlineActive : undefined]} />
                    </View>
                  </TouchableRipple>
                ))}
              </View>
              <Searchbar
                placeholder="Search by name, symbol, or contract address"
                value={search}
                onChangeText={setSearch}
                style={styles.searchbar}
                inputStyle={styles.searchbarInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <FlatList
            style={styles.list}
            contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 10 }}
            data={blockedBySingleEntry || entriesClosed ? [] : filteredCandidates}
            keyExtractor={(c) => c.mint}
            ListEmptyComponent={
              blockedBySingleEntry || entriesClosed ? null : (
                <EmptyState icon="magnifying-glass" label="No Coins Found" hint="Nothing matches this filter or search." />
              )
            }
            renderItem={({ item }) => {
              const isPicked = !!picked.find((p) => p.mint === item.mint);
              return (
                <TouchableRipple
                  style={[styles.assetRow, isPicked ? styles.assetRowPicked : undefined]}
                  onPress={() => togglePick(item)}
                >
                  <View style={styles.assetRowInner}>
                    <View style={styles.assetRowLeft}>
                      <TokenIcon mint={item.mint} icon={item.icon} symbol={item.symbol} size={28} />
                      <View style={{ flexShrink: 1 }}>
                        <View style={styles.assetSymbolRow}>
                          <Text style={styles.assetSymbol}>{item.symbol}</Text>
                          <TouchableRipple
                            style={styles.chartButton}
                            borderless
                            onPress={() => setChartCandidate(item)}
                          >
                            <FontAwesome6 name="chart-line" size={11} color={C.textSecondary} />
                          </TouchableRipple>
                        </View>
                        <Text style={styles.assetName} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.assetFp, isPicked ? { color: C.accentText } : undefined]}>
                        {item.fpCost} FP
                      </Text>
                      <Text style={styles.assetTier}>
                        {item.tier}
                        {item.volatilityPct != null ? ` · ±${item.volatilityPct.toFixed(1)}%` : ""}
                      </Text>
                    </View>
                  </View>
                </TouchableRipple>
              );
            }}
          />

          <View style={styles.footer}>
            <TouchableRipple
              style={[styles.enterButton, !canSubmit ? styles.enterDisabled : undefined]}
              borderless
              disabled={!canSubmit}
              onPress={onSubmit}
            >
              <View style={styles.enterInner}>
                {submitting ? <ActivityIndicator size={16} color={C.accentTextOn} /> : null}
                <Text style={[styles.enterText, !canSubmit ? styles.enterTextDisabled : undefined]}>
                  {blockedBySingleEntry
                    ? "Already Entered"
                    : entriesClosed
                      ? duelFull && !timeClosed
                        ? "Duel Full"
                        : "Entries Closed"
                      : selectedAccount
                        ? `Enter for ${formatAmountCompact(tournament.entryFeeLamports, decimalsForMint(tournament.mint))} ${currencyForMint(tournament.mint)}`
                        : "Connect & Enter"}
                </Text>
              </View>
            </TouchableRipple>
          </View>
        </>
      )}

      <ChartModal candidate={chartCandidate} onClose={() => setChartCandidate(null)} />
    </View>
  );
}

// The tournament page's header: the same panel as the lobby's, with this tournament's details in
// place of the filters (see components/top-bar/TournamentDetails.tsx).
export function DraftHeader({ tournamentId, standings }: { tournamentId: string; /** The standings page: no entry tabs, and the popup's button just closes it. */ standings?: boolean }) {
  const id = BigInt(tournamentId);
  const { data: tournament } = useTournament(id);
  const { data: meta } = useTournamentMeta();
  const [infoOpen, setInfoOpen] = useState(false);
  const { setPanelHeader } = useChrome();
  useEffect(() => {
    setPanelHeader(true);
    return () => setPanelHeader(false);
  }, [setPanelHeader]);
  const pubkey = useMemo(() => tournamentPda(id)[0], [tournamentId]);
  const tournamentMeta = meta?.[tournamentId];
  const { selectedAccount } = useAuthorization();
  const { data: myEntries } = useMyEntries(tournament ? pubkey : null, selectedAccount?.publicKey ?? null);
  const [tab, setTab] = useDraftTab(tournamentId);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(timer);
  }, []);
  // Multiple tournaments get New Entry / My Entries tabs while entries are still open.
  const showTabs = !standings && !!tournament && tournament.entryMode === "multiple" && now < Number(tournament.startTs);
  const tabs = showTabs
    ? {
        items: [
          { key: "draft", label: "New Entry" },
          { key: "mine", label: "My Entries (" + (myEntries?.length ?? 0) + ")" },
        ],
        active: tab,
        onChange: (k: string) => setTab(k as "draft" | "mine"),
      }
    : undefined;
  return (
    <>
      <TopBar
        tournament={tournament ? { account: tournament, meta: tournamentMeta, onOpenInfo: () => setInfoOpen(true), tabs } : undefined}
      />
      {tournament && infoOpen ? (
        <TournamentInfoModal
          row={{ publicKey: pubkey, account: tournament }}
          meta={tournamentMeta}
          onClose={() => setInfoOpen(false)}
          ctaLabel={standings ? "Close" : tournament.entryMode === "single" && (myEntries?.length ?? 0) > 0 ? "View" : "Draft"}
          onPressCta={() => setInfoOpen(false)}
        />
      ) : null}
    </>
  );
}

// How full the portfolio is: each of the five coins adds a fifth of the bar (20%, 40% ... 100%).
// The gradient runs purple to green across the FULL track, so the fill reveals more of it as it grows.
const AnimatedRect = Animated.createAnimatedComponent(Rect);

function BudgetBar({ filled, total }: { filled: number; total: number }) {
  const [width, setWidth] = useState(0);
  const target = Math.max(0, Math.min(1, filled / total)) * width;
  const fill = useRef(new Animated.Value(0)).current;
  // Glide to the new width instead of jumping (SVG props can't use the native driver).
  useEffect(() => {
    Animated.timing(fill, { toValue: target, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, fill]);
  return (
    <View style={styles.barTrack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={4}>
          <Defs>
            <LinearGradient id="budgetGradient" x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={C.accent} />
              <Stop offset="1" stopColor={C.positive} />
            </LinearGradient>
          </Defs>
          <AnimatedRect x="0" y="0" width={fill} height="4" rx="2" fill="url(#budgetGradient)" />
        </Svg>
      ) : null}
    </View>
  );
}

function MyEntriesList({
  entries,
  candidatesByMint,
  entriesClosed,
  tournament,
}: {
  entries: { publicKey: import("@solana/web3.js").PublicKey; account: EntryAccount }[];
  candidatesByMint: Map<string, Candidate>;
  entriesClosed: boolean;
  tournament: import("../pumpfantasy/accounts").TournamentAccount;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="ghost"
        label="No Entries Yet"
        hint={entriesClosed ? "You didn't enter this tournament." : "Build one on the New Entry tab."}
      />
    );
  }
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={entries}
      keyExtractor={(row) => row.publicKey.toBase58()}
      renderItem={({ item }) => (
        <PortfolioCard
          portfolioNo={item.account.entryIndex + 1}
          badge={entryBadge(tournament)}
          slots={item.account.picks.map((pick, i) => ({ key: String(i), candidate: candidatesByMint.get(pick.toBase58()) }))}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, backgroundColor: C.bg },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  tabActive: { backgroundColor: C.accent, borderColor: C.accent },
  tabText: { color: C.textSecondary, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: C.accentTextOn },
  budgetBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  budgetTitle: { color: C.textPrimary, fontWeight: "800", fontSize: 16 },
  budgetValue: { color: C.positive, fontWeight: "800", fontSize: 16 },
  barTrack: { height: 4, borderRadius: 2, marginHorizontal: 16, marginTop: 10, backgroundColor: C.glass, overflow: "hidden" },
  slotsRow: { flexDirection: "row", gap: 2, paddingLeft: 16, paddingRight: 10, paddingTop: 8 },
  portfolioWrap: { paddingHorizontal: 16, paddingTop: 16 },
  error: { color: C.error, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  alreadyIn: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.accent2Tint,
  },
  closedBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.glass,
  },
  // Fixed single row, all 6 tabs evenly split across the full width — not a
  // horizontally-scrolling pill list (that let each pill stretch to fill
  // the row's height instead of sizing to its text, confirmed live
  // 2026-09-18: a flex-row ScrollView content container defaults every
  // child to align-items:stretch on its cross axis unless told otherwise).
  // Underlined tabs, same look as the tournament popup's (TournamentInfoModal).
  categoryRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 8, marginBottom: 10 },
  categoryTab: { flex: 1 },
  categoryTabInner: { alignItems: "center", paddingTop: 10 },
  categoryTabText: { color: C.textSecondary, fontWeight: "700", fontSize: 13.5, paddingBottom: 9, paddingHorizontal: 2 },
  categoryTabTextActive: { color: C.textPrimary },
  categoryUnderline: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  categoryUnderlineActive: { backgroundColor: C.accent },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 2, // plus the tabs' 10 below: 12 above the field, 12 below it (list padding)
    height: 38,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    elevation: 0,
    shadowOpacity: 0,
  },
  searchbarInput: { fontSize: 13, minHeight: 0 },
  entryCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
  },
  entrySlotsRow: { flexDirection: "row", gap: 6 },
  entrySlot: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  list: { flex: 1, marginTop: 8 },
  assetRow: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
  },
  assetRowPicked: { borderColor: C.accent, backgroundColor: C.accentTint },
  assetRowInner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  assetRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  assetSymbolRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  assetSymbol: { color: C.textPrimary, fontWeight: "700", fontSize: 14 },
  chartButton: { padding: 4, borderRadius: 999 },
  assetName: { color: C.textSecondary, fontSize: 11, maxWidth: 160 },
  assetFp: { color: C.textSecondary, fontWeight: "700", fontSize: 13 },
  assetTier: { color: C.textSecondary, fontSize: 10, marginTop: 2 },
  // Same size and look as the primary button on the tournament-created screen.
  enterButton: { height: 52, borderRadius: 999, backgroundColor: C.accent, justifyContent: "center" },
  enterDisabled: { backgroundColor: C.glassStrong },
  enterInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  enterText: { color: C.accentTextOn, fontWeight: "800", fontSize: 15 },
  enterTextDisabled: { color: C.textSecondary },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    backgroundColor: C.card,
  },
});
