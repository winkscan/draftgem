import { useMemo, useRef, useState } from "react";
import { FlatList, Linking, StyleSheet, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { PortfolioCard } from "../components/PortfolioCard";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { PublicKey } from "@solana/web3.js";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useConnection } from "../utils/ConnectionProvider";
import { CLUSTER } from "../pumpfantasy/config";
import { useTournament, useAssetPrices, useTournamentEntries } from "../pumpfantasy/hooks";
import { useCandidates, type Candidate } from "../pumpfantasy/candidates";
import { isArchivedTournament } from "../pumpfantasy/hooks";
import { useAuthorization } from "../utils/useAuthorization";
import { tournamentPda } from "../pumpfantasy/pdas";
import { useLivePrices } from "../pumpfantasy/livePrices";
import { computePortfolioScore, projectPrizes, type PickScore } from "../pumpfantasy/liveScore";
import { bpsToPercentLabel, ellipsify } from "../pumpfantasy/format";
import { currencyForMint, decimalsForMint, formatAmountCompact } from "../pumpfantasy/currency";
import { getTournamentPhase } from "../pumpfantasy/tournamentPhase";
import { PAYOUT_CHOICES, useTournamentMeta, type PayoutChoice } from "../pumpfantasy/customTournaments";
import { PF_COLORS as C } from "../theme";

interface Row {
  key: string;
  rank: number;
  player: import("@solana/web3.js").PublicKey;
  entryIndex: number;
  createdAt: bigint;
  scoreBps: number | null;
  picks: PickScore[];
  prizeLamports: bigint;
  claimed: boolean;
  isMine: boolean;
}

// All players' standings for one tournament, live during the round and final
// afterwards: your own portfolio(s) pinned on top (swipe between them), a slot where a portfolio picked
// from the list is shown for comparison, then the ranked list (place / player / score / prize). Live scores use
// current prices (refreshed every 25s, see livePrices.ts); once the round is
// over the submitted end prices are used instead.
export function LeaderboardScreen() {
  const route = useRoute();
  const { tournamentId } = route.params as { tournamentId: string };
  const id = BigInt(tournamentId);
  const tournamentPubkey = useMemo(() => tournamentPda(id)[0], [tournamentId]);

  const { selectedAccount } = useAuthorization();
  const { data: tournament } = useTournament(id);
  // A finished tournament is closed on chain (to recover the rent); its standings come from the archive.
  const archivedId = isArchivedTournament(tournament) ? id : null;
  const { data: assets } = useAssetPrices(tournament ? tournamentPubkey : null, archivedId);
  const { data: entries, isLoading: entriesLoading } = useTournamentEntries(tournament ? tournamentPubkey : null, archivedId);
  const { data: candidates } = useCandidates();
  // Player-made tournaments can pay Top 1 / Top 3 / 30%; everything else pays the top half.
  const { data: tournamentMeta } = useTournamentMeta();
  const payout: PayoutChoice = tournamentMeta?.[tournamentId]?.payout ?? "p50";
  const creatorFeeBps = tournamentMeta?.[tournamentId]?.creatorFeeBps ?? 0;

  const [myIndex, setMyIndex] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(0);
  const pagerRef = useRef<FlatList<Row>>(null);
  const [compareKey, setCompareKey] = useState<string | null>(null);

  const assetsByMint = useMemo(() => {
    const m = new Map<string, NonNullable<typeof assets>[number]["account"]>();
    for (const a of assets ?? []) m.set(a.account.mint.toBase58(), a.account);
    return m;
  }, [assets]);

  const candidatesByMint = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of candidates ?? []) m.set(c.mint, c);
    return m;
  }, [candidates]);

  const now = Math.floor(Date.now() / 1000);
  const phase = tournament ? getTournamentPhase(tournament, now) : "upcoming";

  // Payout proof: the claim_prize transaction is the newest successful one that
  // touched the winning entry's account (enter and settle come before it), so
  // look that up on demand and open it on Solscan. Falls back to the entry's
  // account page if the lookup fails.
  const { connection } = useConnection();
  const [openingPayout, setOpeningPayout] = useState<string | null>(null);
  const openPayout = async (entryKey: string) => {
    setOpeningPayout(entryKey);
    let url = `https://solscan.io/account/${entryKey}?cluster=${CLUSTER}`;
    try {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(entryKey), { limit: 10 });
      // Once the tournament is over the entry account is closed too, so the newest transaction on it is
      // the closing one — look for the one that actually ran ClaimPrize.
      for (const s of sigs.filter((x) => x.err === null).slice(0, 4)) {
        const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
        if (tx?.meta?.logMessages?.some((l) => l.includes("Instruction: ClaimPrize"))) {
          url = `https://solscan.io/tx/${s.signature}?cluster=${CLUSTER}`;
          break;
        }
      }
    } catch {
      // keep the account-page fallback
    } finally {
      setOpeningPayout(null);
    }
    await Linking.openURL(url);
  };

  // Once every asset has its final price there's nothing left to poll.
  const wantsLivePrices = phase !== "upcoming" && (assets ?? []).some((a) => !a.account.resolved);
  const mints = useMemo(() => (assets ?? []).map((a) => a.account.mint.toBase58()), [assets]);
  const { data: livePricesMicros } = useLivePrices(mints, wantsLivePrices);

  const rows: Row[] = useMemo(() => {
    if (!tournament) return [];
    const scored = (entries ?? []).map((e) => {
      const portfolio = computePortfolioScore(e.account.picks, assetsByMint, livePricesMicros);
      return {
        entry: e,
        picks: portfolio.picks,
        // A settled entry carries its real on-chain score; otherwise compute it.
        scoreBps: e.account.settled ? e.account.scoreBps : portfolio.totalBps,
      };
    });
    // Best score first; equal scores go to whoever entered earlier.
    scored.sort((a, b) => {
      if (a.scoreBps == null || b.scoreBps == null) return (b.scoreBps ?? -Infinity) === (a.scoreBps ?? -Infinity) ? 0 : a.scoreBps == null ? 1 : -1;
      if (b.scoreBps !== a.scoreBps) return b.scoreBps - a.scoreBps;
      return Number(a.entry.account.createdAt - b.entry.account.createdAt);
    });
    // Once finalized every entry's real prize is on chain (set_prize) — use that directly rather
    // than projecting, since Top 3/30% pay different amounts per rank and only the real per-entry
    // value can show that correctly. Still live: project from scores (see liveScore.ts).
    const prizes =
      tournament.status === "finalized"
        ? scored.map((s) => s.entry.account.prizeLamports)
        : projectPrizes(tournament, scored.map((s) => s.scoreBps), payout, creatorFeeBps);
    return scored.map((s, i) => ({
      key: s.entry.publicKey.toBase58(),
      rank: i + 1,
      player: s.entry.account.player,
      entryIndex: s.entry.account.entryIndex,
      createdAt: s.entry.account.createdAt,
      scoreBps: s.scoreBps,
      picks: s.picks,
      prizeLamports: prizes[i],
      claimed: s.entry.account.claimed,
      isMine: !!selectedAccount && s.entry.account.player.equals(selectedAccount.publicKey),
    }));
  }, [entries, assetsByMint, livePricesMicros, tournament, selectedAccount, payout, creatorFeeBps]);

  if (!tournament || entriesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const myRows = rows.filter((r) => r.isMine);
  const myShown = Math.min(myIndex, Math.max(0, myRows.length - 1));
  const compare = rows.find((r) => r.key === compareKey && !r.isMine);
  const waitingForPrices = rows.length > 0 && rows.every((r) => r.scoreBps == null);
  const mine = myRows[myShown];
  const decimals = decimalsForMint(tournament.mint);
  const currency = currencyForMint(tournament.mint);

  const goToMine = (i: number) => {
    setMyIndex(i);
    pagerRef.current?.scrollToOffset({ offset: i * pagerWidth, animated: true });
  };

  const listHeader = (
    <View>
      {tournament.status === "cancelled" ? (
        <Text style={styles.notice}>
          This tournament was cancelled because its results could not be finalized. Every entry fee was refunded (✓).
        </Text>
      ) : null}
      {waitingForPrices && phase !== "upcoming" && tournament.status !== "cancelled" ? (
        <Text style={styles.notice}>
          {phase === "live"
            ? "Waiting for the tournament's start prices to be recorded…"
            : "Final prices aren't recorded yet."}
        </Text>
      ) : null}
      {mine && mine.claimed && mine.prizeLamports > 0n ? (
        <TouchableRipple style={styles.payoutPill} onPress={() => openPayout(mine.key)}>
          <View style={styles.payoutPillInner}>
            <FontAwesome6 name="circle-check" size={13} color={C.positive} />
            <Text style={styles.payoutPillText}>Paid out · View payout on Solscan</Text>
            {openingPayout === mine.key ? (
              <ActivityIndicator size={12} color={C.accent2} />
            ) : (
              <FontAwesome6 name="arrow-up-right-from-square" size={11} color={C.accent2} />
            )}
          </View>
        </TouchableRipple>
      ) : null}
      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: 40 }]}>Place</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Player</Text>
        <Text style={[styles.th, { flex: 1 }]}>Score</Text>
        <Text style={[styles.th, { flex: 1 }]}>Prize</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Pinned above the list: my portfolio (or several, swipe / tap the dots) and the comparison slot. */}
      {myRows.length > 0 ? (
        <View onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}>
          {pagerWidth > 0 ? (
            <FlatList
              ref={pagerRef}
              data={myRows}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(r) => r.key}
              getItemLayout={(_, i) => ({ length: pagerWidth, offset: pagerWidth * i, index: i })}
              onMomentumScrollEnd={(e) => setMyIndex(Math.round(e.nativeEvent.contentOffset.x / pagerWidth))}
              renderItem={({ item }) => (
                <View style={{ width: pagerWidth, paddingHorizontal: 16 }}>
                  <StandingCard row={item} tournament={tournament} candidatesByMint={candidatesByMint} title={"Portfolio #" + (item.entryIndex + 1)} />
                </View>
              )}
            />
          ) : null}
          {myRows.length > 1 ? (
            <View style={styles.dots}>
              {myRows.map((r, i) => (
                <TouchableRipple key={r.key} borderless style={styles.dotHit} onPress={() => goToMine(i)}>
                  <View style={[styles.dot, i === myShown ? styles.dotActive : undefined]} />
                </TouchableRipple>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.compareSlot}>
        {compare ? (
          <StandingCard
            row={compare}
            tournament={tournament}
            candidatesByMint={candidatesByMint}
            title={ellipsify(compare.player, 4) + (tournament.entryMode === "multiple" ? " #" + (compare.entryIndex + 1) : "")}
            onPress={() => setCompareKey(null)}
          />
        ) : (
          <View style={styles.compareHint}>
            <Text style={styles.compareHintText}>Click portfolio to compare</Text>
          </View>
        )}
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(r) => r.key}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyState icon="ghost" label="No Entries" hint="Nobody entered this tournament." />}
        ListFooterComponent={
          <Text style={styles.footnote}>
            {PAYOUT_CHOICES.find((p) => p.key === payout)?.description.replace(/\.$/, "")}, after a{" "}
            {creatorFeeBps > 0 ? "10% cut (5% platform, 5% the creator)" : "5% fee"}; a tie at the cut-off wins too. Tap the link icon next to a
            paid prize to see the payout on Solscan.
          </Text>
        }
        renderItem={({ item: r }) => (
          <TouchableRipple
            borderless
            style={[styles.rowWrap]}
            onPress={() => {
              if (r.isMine) goToMine(myRows.findIndex((m) => m.key === r.key));
              else setCompareKey(r.key === compareKey ? null : r.key);
            }}
          >
            <View style={[styles.row, r.isMine ? styles.rowMine : undefined, r.key === compareKey ? styles.rowCompared : undefined]}>
              <Text style={[styles.cell, { width: 40 }, r.isMine ? styles.bold : undefined]}>{r.rank}</Text>
              <Text style={[styles.cell, { flex: 1.3 }, r.isMine ? styles.bold : undefined]} numberOfLines={1}>
                {r.isMine ? "You" : ellipsify(r.player, 4)}
                {tournament.entryMode === "multiple" ? ` #${r.entryIndex + 1}` : ""}
              </Text>
              <Text
                style={[styles.cell, { flex: 1 }, styles.bold, r.scoreBps == null ? styles.pending : r.scoreBps >= 0 ? styles.up : styles.down]}
              >
                {r.scoreBps == null ? "…" : bpsToPercentLabel(r.scoreBps)}
              </Text>
              <View style={[styles.prizeCell, { flex: 1 }]}>
                <Text style={[styles.cell, r.isMine ? styles.bold : undefined]}>
                  {r.prizeLamports > 0n ? formatAmountCompact(r.prizeLamports, decimals) : "-"}
                </Text>
                {r.claimed && r.prizeLamports > 0n ? (
                  <TouchableRipple borderless style={styles.payoutIcon} onPress={() => openPayout(r.key)}>
                    {openingPayout === r.key ? (
                      <ActivityIndicator size={11} color={C.accent2} />
                    ) : (
                      <FontAwesome6 name="arrow-up-right-from-square" size={11} color={C.accent2} />
                    )}
                  </TouchableRipple>
                ) : null}
              </View>
            </View>
          </TouchableRipple>
        )}
      />
    </View>
  );
}

// One standings row as the shared portfolio card: place and prize right after the title, the score on
// the right, and each coin's own result under it.
function StandingCard({
  row,
  tournament,
  candidatesByMint,
  title,
  onPress,
}: {
  row: Row;
  tournament: import("../pumpfantasy/accounts").TournamentAccount;
  candidatesByMint: Map<string, Candidate>;
  title: string;
  onPress?: () => void;
}) {
  const titleBadges: { label: string; tone: "accent" | "live" }[] = [{ label: "Nr. " + row.rank, tone: "accent" }];
  if (row.prizeLamports > 0n) {
    titleBadges.push({
      label: formatAmountCompact(row.prizeLamports, decimalsForMint(tournament.mint)) + " " + currencyForMint(tournament.mint),
      tone: "live",
    });
  }
  return (
    <PortfolioCard
      title={title}
      titleBadges={titleBadges}
      badge={
        row.scoreBps == null
          ? { label: "…", tone: "neutral" }
          : { label: bpsToPercentLabel(row.scoreBps), tone: row.scoreBps < 0 ? "negative" : "positive" }
      }
      slots={row.picks.map((p) => ({
        key: p.mint,
        candidate: candidatesByMint.get(p.mint),
        pct: { text: p.bps == null ? "…" : bpsToPercentLabel(p.bps), tone: p.bps == null ? "pending" : p.bps >= 0 ? "up" : "down" },
      }))}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, backgroundColor: C.bg },

  dots: { flexDirection: "row", justifyContent: "center", gap: 2, marginTop: 4 },
  dotHit: { padding: 6, borderRadius: 999 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.cardBorder },
  dotActive: { backgroundColor: C.accent },

  compareSlot: { paddingHorizontal: 16, paddingTop: 12 },
  compareHint: { height: 44, borderRadius: 999, backgroundColor: C.glassStrong, alignItems: "center", justifyContent: "center" },
  compareHintText: { color: C.textSecondary, fontWeight: "700", fontSize: 13 },

  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 4, gap: 8, flexGrow: 1 },
  notice: { color: C.textSecondary, fontSize: 12, textAlign: "center", padding: 12 },

  tableHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8 },
  th: { color: C.textSecondary, fontSize: 12 },
  // Same box as the tournament popup's player rows.
  rowWrap: { borderRadius: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMine: { backgroundColor: C.accentTint, borderColor: C.accent },
  rowCompared: { borderColor: C.accent2 },
  cell: { color: C.textSecondary, fontSize: 13 },
  prizeCell: { flexDirection: "row", alignItems: "center", gap: 4 },
  payoutIcon: { padding: 5, borderRadius: 999 },
  payoutPill: {
    marginBottom: 8,
    borderRadius: 999,
    backgroundColor: C.accent2Tint,
    alignSelf: "flex-start",
  },
  payoutPillInner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  payoutPillText: { color: C.textPrimary, fontWeight: "700", fontSize: 12 },
  bold: { color: C.textPrimary, fontWeight: "800" },
  up: { color: C.positive },
  down: { color: C.negative },
  pending: { color: C.textSecondary },

  footnote: { color: C.textSecondary, fontSize: 11, textAlign: "center", paddingHorizontal: 8, marginTop: 8 },
});
