import { useLayoutEffect, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation, useRoute } from "@react-navigation/native";
import { PublicKey } from "@solana/web3.js";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useConnection } from "../utils/ConnectionProvider";
import { CLUSTER } from "../pumpfantasy/config";
import { useTournament, useAssetPrices, useTournamentEntries } from "../pumpfantasy/hooks";
import { useCandidates, type Candidate } from "../pumpfantasy/candidates";
import { useAuthorization } from "../utils/useAuthorization";
import { tournamentPda } from "../pumpfantasy/pdas";
import { useLivePrices } from "../pumpfantasy/livePrices";
import { computePortfolioScore, projectPrizes, type PickScore } from "../pumpfantasy/liveScore";
import { bpsToPercentLabel, ellipsify, formatSol } from "../pumpfantasy/format";
import { getTournamentPhase } from "../pumpfantasy/tournamentPhase";
import { PAYOUT_CHOICES, useTournamentMeta, type PayoutChoice } from "../pumpfantasy/customTournaments";
import { ModeBadges } from "../components/ModeBadge";
import { TokenIcon } from "../components/TokenIcon";
import { PF_COLORS as C } from "../theme";

const PAGE_SIZE = 10;

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
// afterwards: your own portfolio(s) on top with the % each coin made, then
// the ranked table (place / player / score / projected prize), where any
// other portfolio can be opened side by side for comparison. Live scores use
// current prices (refreshed every 25s, see livePrices.ts); once the round is
// over the submitted end prices are used instead.
export function LeaderboardScreen() {
  const route = useRoute();
  const { tournamentId } = route.params as { tournamentId: string };
  const id = BigInt(tournamentId);
  const tournamentPubkey = useMemo(() => tournamentPda(id)[0], [tournamentId]);

  const { selectedAccount } = useAuthorization();
  const { data: tournament } = useTournament(id);
  const { data: assets } = useAssetPrices(tournament ? tournamentPubkey : null);
  const { data: entries, isLoading: entriesLoading } = useTournamentEntries(tournament ? tournamentPubkey : null);
  const { data: candidates } = useCandidates();
  // Player-made tournaments can pay Top 1 / Top 3 / 30%; everything else pays the top half.
  const { data: tournamentMeta } = useTournamentMeta();
  const payout: PayoutChoice = tournamentMeta?.[tournamentId]?.payout ?? "p50";

  const [page, setPage] = useState(0);
  const [myIndex, setMyIndex] = useState(0);
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

  // "Live Standings" only while the round is running; afterwards it's the result.
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title: phase === "live" ? "Live Standings" : "Final Standings" });
  }, [navigation, phase]);

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
      const claim = sigs.find((s) => s.err === null);
      if (claim) url = `https://solscan.io/tx/${claim.signature}?cluster=${CLUSTER}`;
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
    const prizes = projectPrizes(
      tournament,
      scored.map((s) => s.scoreBps),
      payout,
    );
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
  }, [entries, assetsByMint, livePricesMicros, tournament, selectedAccount, payout]);

  if (!tournament || entriesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const myRows = rows.filter((r) => r.isMine);
  const mine = myRows[Math.min(myIndex, myRows.length - 1)];
  const compare = rows.find((r) => r.key === compareKey && !r.isMine);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const waitingForPrices = rows.length > 0 && rows.every((r) => r.scoreBps == null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.header}>
        <ModeBadges tournament={tournament} />
        <Text style={styles.headerText}>
          {rows.length} portfolio{rows.length === 1 ? "" : "s"} · {phase === "live" ? "Live" : "Results"}
        </Text>
      </View>

      {mine ? (
        <>
          <PortfolioPanel
            title={
              <>
                <Text style={styles.metaLabel}>
                  Place: <Text style={styles.metaValue}>{mine.rank}</Text>
                </Text>
                <Text style={styles.metaLabel}>
                  Prize:{" "}
                  <Text style={styles.metaValue}>
                    {mine.prizeLamports > 0n ? `${formatSol(mine.prizeLamports, 3)} SOL` : "—"}
                  </Text>
                </Text>
              </>
            }
            scoreBps={mine.scoreBps}
            picks={mine.picks}
            candidatesByMint={candidatesByMint}
          />
          {mine.claimed && mine.prizeLamports > 0n ? (
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
        </>
      ) : null}

      {myRows.length > 1 ? (
        <View style={styles.dots}>
          {myRows.map((r, i) => (
            <TouchableRipple
              key={r.key}
              borderless
              style={styles.dotHit}
              onPress={() => setMyIndex(i)}
            >
              <View style={[styles.dot, i === Math.min(myIndex, myRows.length - 1) ? styles.dotActive : undefined]} />
            </TouchableRipple>
          ))}
        </View>
      ) : null}

      {compare ? (
        <View style={styles.compareWrap}>
          <PortfolioPanel
            title={
              <>
                <Text style={styles.metaLabel}>
                  Place: <Text style={styles.metaValue}>{compare.rank}</Text>
                </Text>
                <Text style={styles.metaLabel}>
                  Player: <Text style={styles.metaValue}>{ellipsify(compare.player, 5)}</Text>
                </Text>
              </>
            }
            scoreBps={compare.scoreBps}
            picks={compare.picks}
            candidatesByMint={candidatesByMint}
          />
        </View>
      ) : null}

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

      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: 40 }]}>Place</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Player</Text>
        <Text style={[styles.th, { flex: 1 }]}>Score</Text>
        <Text style={[styles.th, { flex: 1 }]}>Prize</Text>
        <Text style={[styles.th, { width: 44, textAlign: "center" }]}>Compare</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {pageRows.length === 0 ? (
          <Text style={styles.notice}>No entries in this tournament.</Text>
        ) : (
          pageRows.map((r) => (
            <View
              key={r.key}
              style={[styles.row, r.isMine ? styles.rowMine : undefined, r.key === compareKey ? styles.rowCompared : undefined]}
            >
              <Text style={[styles.cell, { width: 40 }, r.isMine ? styles.bold : undefined]}>{r.rank}</Text>
              <Text style={[styles.cell, { flex: 1.3 }, r.isMine ? styles.bold : undefined]} numberOfLines={1}>
                {r.isMine ? "You" : ellipsify(r.player, 4)}
                {tournament.entryMode === "multiple" ? ` #${r.entryIndex + 1}` : ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { flex: 1 },
                  styles.bold,
                  r.scoreBps == null ? styles.pending : r.scoreBps >= 0 ? styles.up : styles.down,
                ]}
              >
                {r.scoreBps == null ? "…" : bpsToPercentLabel(r.scoreBps)}
              </Text>
              <View style={[styles.prizeCell, { flex: 1 }]}>
                <Text style={[styles.cell, r.isMine ? styles.bold : undefined]}>
                  {r.prizeLamports > 0n ? formatSol(r.prizeLamports, 3) : "-"}
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
              <View style={{ width: 44, alignItems: "center" }}>
                {r.isMine ? null : (
                  <TouchableRipple
                    borderless
                    style={[styles.compareBtn, r.key === compareKey ? styles.compareBtnActive : undefined]}
                    onPress={() => setCompareKey(r.key === compareKey ? null : r.key)}
                  >
                    <FontAwesome6
                      name={r.key === compareKey ? "xmark" : "user"}
                      size={13}
                      color={r.key === compareKey ? C.accentTextOn : "#fff"}
                    />
                  </TouchableRipple>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {pageCount > 1 ? (
        <View style={styles.pager}>
          <TouchableRipple borderless style={styles.pagerArrow} disabled={page === 0} onPress={() => setPage(page - 1)}>
            <FontAwesome6 name="chevron-left" size={12} color={page === 0 ? C.disabled : C.textSecondary} />
          </TouchableRipple>
          {Array.from({ length: pageCount }, (_, i) => i)
            .filter((i) => pageCount <= 7 || Math.abs(i - page) <= 2 || i === 0 || i === pageCount - 1)
            .map((i) => (
              <TouchableRipple
                key={i}
                borderless
                style={[styles.pagerNum, i === page ? styles.pagerNumActive : undefined]}
                onPress={() => setPage(i)}
              >
                <Text style={[styles.pagerNumText, i === page ? { color: "#fff" } : undefined]}>{i + 1}</Text>
              </TouchableRipple>
            ))}
          <TouchableRipple
            borderless
            style={styles.pagerArrow}
            disabled={page >= pageCount - 1}
            onPress={() => setPage(page + 1)}
          >
            <FontAwesome6 name="chevron-right" size={12} color={page >= pageCount - 1 ? C.disabled : C.textSecondary} />
          </TouchableRipple>
        </View>
      ) : null}

      <Text style={styles.footnote}>
        {PAYOUT_CHOICES.find((p) => p.key === payout)?.description.replace(/\.$/, "")}, minus a 5% fee; a tie at the cut-off wins too. Tap the link icon next to a paid prize to see the payout on Solscan.
      </Text>
    </ScrollView>
  );
}

function PortfolioPanel({
  title,
  scoreBps,
  picks,
  candidatesByMint,
}: {
  title: React.ReactNode;
  scoreBps: number | null;
  picks: PickScore[];
  candidatesByMint: Map<string, Candidate>;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={{ flexDirection: "row", gap: 16, flexShrink: 1, flexWrap: "wrap" }}>{title}</View>
        <View style={[styles.scorePill, scoreBps != null && scoreBps < 0 ? { backgroundColor: C.negative } : undefined]}>
          <Text style={styles.scorePillText}>{scoreBps == null ? "…" : bpsToPercentLabel(scoreBps)}</Text>
        </View>
      </View>
      <View style={styles.cards}>
        {picks.map((p) => {
          const c = candidatesByMint.get(p.mint);
          return (
            <View key={p.mint} style={styles.card}>
              <View style={styles.cardIcon}>
                <TokenIcon mint={p.mint} icon={c?.icon} symbol={c?.symbol ?? "?"} size={20} />
              </View>
              <Text style={styles.cardSymbol} numberOfLines={1}>
                {c?.symbol ?? ellipsify(p.mint, 2)}
              </Text>
              <Text
                style={[styles.cardPct, p.bps == null ? styles.pending : p.bps >= 0 ? styles.up : styles.down]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {p.bps == null ? "…" : bpsToPercentLabel(p.bps)}
              </Text>
              <View style={styles.cardDivider} />
              <Text style={styles.cardTier} numberOfLines={1} adjustsFontSizeToFit>
                {c?.tier ?? "—"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, paddingBottom: 8 },
  headerText: { color: C.textSecondary, fontSize: 12 },

  panel: { marginHorizontal: 16, marginTop: 4, marginBottom: 8 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  metaLabel: { color: C.textPrimary, fontWeight: "700", fontSize: 13 },
  metaValue: { color: C.accentText, fontWeight: "400" },
  scorePill: { backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  scorePillText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cards: { flexDirection: "row", gap: 6 },
  card: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  cardIcon: { position: "absolute", top: -8, left: -4 },
  cardSymbol: { color: C.textPrimary, fontWeight: "800", fontSize: 13, marginTop: 6 },
  cardPct: { fontWeight: "700", fontSize: 11, marginTop: 2 },
  cardDivider: { height: 1, alignSelf: "stretch", backgroundColor: C.cardBorder, marginVertical: 6, marginHorizontal: 6 },
  cardTier: { color: C.textSecondary, fontSize: 9, fontWeight: "600" },

  dots: { flexDirection: "row", justifyContent: "center", gap: 2, marginBottom: 4 },
  dotHit: { padding: 6, borderRadius: 999 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.cardBorder },
  dotActive: { backgroundColor: C.accent },
  compareWrap: { backgroundColor: C.glass, paddingTop: 14, marginTop: 4, marginBottom: 8 },

  notice: { color: C.textSecondary, fontSize: 12, textAlign: "center", padding: 12 },

  tableHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 8 },
  th: { color: C.textSecondary, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 8,
    minHeight: 46,
  },
  rowMine: { backgroundColor: C.accentTint, borderColor: C.accent },
  rowCompared: { borderColor: C.accent2 },
  cell: { color: C.textSecondary, fontSize: 13 },
  prizeCell: { flexDirection: "row", alignItems: "center", gap: 4 },
  payoutIcon: { padding: 5, borderRadius: 999 },
  payoutPill: {
    marginHorizontal: 16,
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
  compareBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.glassStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  compareBtnActive: { backgroundColor: C.accent },

  pager: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  pagerArrow: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pagerNum: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pagerNumActive: { backgroundColor: C.accent },
  pagerNumText: { color: C.textSecondary, fontWeight: "700", fontSize: 13 },
  footnote: { color: C.textSecondary, fontSize: 11, textAlign: "center", paddingHorizontal: 24, marginTop: 16 },
});
