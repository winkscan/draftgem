import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Searchbar, Text, TouchableRipple } from "react-native-paper";
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
import { formatSol } from "../pumpfantasy/format";
import { useTournamentMeta } from "../pumpfantasy/customTournaments";
import { TokenIcon } from "../components/TokenIcon";
import { ModeBadges } from "../components/ModeBadge";
import { ChartModal } from "../components/ChartModal";
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
  const [tab, setTab] = useState<"draft" | "mine">("draft");
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
      await enterTournament(connection, player, signAndSendTransaction, id, attestation, entryIndex);
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
      <View style={styles.badgeRow}>
        <ModeBadges tournament={tournament} />
        {tournament.guaranteedAmountLamports > 0n ? (
          <Text style={styles.guaranteedText}>
            {formatSol(tournament.guaranteedAmountLamports, 2)} SOL guaranteed
          </Text>
        ) : null}
      </View>

      {isMultiple && !entriesClosed ? (
        <View style={styles.tabRow}>
          <TouchableRipple
            style={[styles.tab, tab === "draft" ? styles.tabActive : undefined]}
            onPress={() => setTab("draft")}
          >
            <Text style={[styles.tabText, tab === "draft" ? styles.tabTextActive : undefined]}>New Entry</Text>
          </TouchableRipple>
          <TouchableRipple
            style={[styles.tab, tab === "mine" ? styles.tabActive : undefined]}
            onPress={() => setTab("mine")}
          >
            <Text style={[styles.tabText, tab === "mine" ? styles.tabTextActive : undefined]}>
              My Entries ({myEntries?.length ?? 0})
            </Text>
          </TouchableRipple>
        </View>
      ) : null}

      {isMultiple && (tab === "mine" || entriesClosed) ? (
        <MyEntriesList
          entries={myEntries ?? []}
          candidatesByMint={candidatesByMint}
          entriesClosed={entriesClosed}
        />
      ) : (
        <>
          <View style={styles.budgetBar}>
            <Text style={styles.budgetLabel}>{viewingExistingSingleEntry ? "Your portfolio" : "Budget left"}</Text>
            {!viewingExistingSingleEntry ? (
              <Text style={[styles.budgetValue, remainingFp < 0 ? { color: C.error } : undefined]}>
                {remainingFp} / {MAX_BUDGET_FP} FP
              </Text>
            ) : null}
          </View>

          <View style={styles.slotsRow}>
            {displayedSlots.map((c, i) => (
              <View key={i} style={styles.slot}>
                {c ? (
                  <>
                    <TokenIcon mint={c.mint} icon={c.icon} symbol={c.symbol} size={22} />
                    <Text style={styles.slotMint} numberOfLines={1}>
                      {c.symbol}
                    </Text>
                    <Text style={styles.slotFp}>{c.fpCost} FP</Text>
                  </>
                ) : (
                  <FontAwesome6 name="plus" size={14} color={C.disabled} />
                )}
              </View>
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {viewingExistingSingleEntry ? (
            <View style={styles.alreadyIn}>
              <Text style={{ color: C.textPrimary, fontWeight: "700" }}>You're in this tournament</Text>
              <Text style={{ color: C.textSecondary, fontSize: 12 }}>
                Spent {myEntry!.fpSpent} FP ·{" "}
                {myEntry!.settled ? `Score ${myEntry!.scoreBps / 100}%` : "Awaiting results"}
              </Text>
            </View>
          ) : entriesClosed ? (
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
                  <TouchableRipple
                    key={cat}
                    style={[styles.categoryPill, categoryTab === cat ? styles.categoryPillActive : undefined]}
                    onPress={() => setCategoryTab(cat)}
                  >
                    <Text
                      style={[styles.categoryPillText, categoryTab === cat ? styles.categoryPillTextActive : undefined]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {cat}
                    </Text>
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
            contentContainerStyle={{ padding: 16, gap: 10 }}
            data={blockedBySingleEntry || entriesClosed ? [] : filteredCandidates}
            keyExtractor={(c) => c.mint}
            ListEmptyComponent={
              blockedBySingleEntry || entriesClosed ? null : (
                <View style={styles.center}>
                  <Text style={{ color: C.textSecondary }}>No coins match this filter.</Text>
                </View>
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
            <Button
              mode="contained"
              buttonColor={C.accent}
              textColor={C.accentTextOn}
              disabled={!canSubmit}
              loading={submitting}
              onPress={onSubmit}
            >
              {blockedBySingleEntry
                ? "Already Entered"
                : entriesClosed
                  ? duelFull && !timeClosed
                    ? "Duel Full"
                    : "Entries Closed"
                  : selectedAccount
                    ? `Enter for ${formatSol(tournament.entryFeeLamports, 2)} SOL`
                    : "Connect & Enter"}
            </Button>
          </View>
        </>
      )}

      <ChartModal candidate={chartCandidate} onClose={() => setChartCandidate(null)} />
    </View>
  );
}

function MyEntriesList({
  entries,
  candidatesByMint,
  entriesClosed,
}: {
  entries: { publicKey: import("@solana/web3.js").PublicKey; account: EntryAccount }[];
  candidatesByMint: Map<string, Candidate>;
  entriesClosed: boolean;
}) {
  if (entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: C.textSecondary }}>
          {entriesClosed
            ? "You didn't enter this tournament."
            : 'No entries yet — build one on the "New Entry" tab.'}
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={entries}
      keyExtractor={(row) => row.publicKey.toBase58()}
      renderItem={({ item }) => {
        const picks = item.account.picks.map((pick) => candidatesByMint.get(pick.toBase58()));
        return (
          <View style={styles.entryCard}>
            <Text style={{ color: C.textPrimary, fontWeight: "700" }}>Portfolio #{item.account.entryIndex + 1}</Text>
            <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 2, marginBottom: 10 }}>
              Spent {item.account.fpSpent} FP ·{" "}
              {item.account.settled ? `Score ${item.account.scoreBps / 100}%` : "Awaiting results"}
            </Text>
            <View style={styles.entrySlotsRow}>
              {picks.map((c, i) => (
                <View key={i} style={styles.entrySlot}>
                  {c ? (
                    <>
                      <TokenIcon mint={c.mint} icon={c.icon} symbol={c.symbol} size={20} />
                      <Text style={styles.slotMint} numberOfLines={1}>
                        {c.symbol}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.slotMint}>?</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, backgroundColor: C.bg },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  guaranteedText: { color: C.positive, fontWeight: "700", fontSize: 12 },
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
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  budgetLabel: { color: C.textSecondary, fontSize: 13 },
  budgetValue: { color: C.textPrimary, fontWeight: "700", fontSize: 13 },
  slotsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  slot: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.cardBorder,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  slotMint: { fontSize: 10, color: C.textPrimary, fontWeight: "600" },
  slotFp: { fontSize: 10, color: C.accentText, fontWeight: "700" },
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
  categoryRow: { flexDirection: "row", gap: 4, paddingHorizontal: 16, marginTop: 12 },
  categoryPill: {
    flex: 1,
    height: 30,
    paddingHorizontal: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  categoryPillActive: { backgroundColor: C.accent, borderColor: C.accent },
  categoryPillText: { color: C.textSecondary, fontWeight: "700", fontSize: 11 },
  categoryPillTextActive: { color: C.accentTextOn },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 8,
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
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    backgroundColor: C.card,
  },
});
