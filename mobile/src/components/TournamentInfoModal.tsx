import { useState } from "react";
import { FlatList, Modal, ScrollView, Share, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { PublicKey } from "@solana/web3.js";
import type { TournamentAccount, EntryAccount } from "../pumpfantasy/hooks";
import { useMyEntries, useTournamentEntries, isArchivedTournament } from "../pumpfantasy/hooks";
import { useCandidates, type Candidate } from "../pumpfantasy/candidates";
import { useAuthorization } from "../utils/useAuthorization";
import { slotsFor } from "../pumpfantasy/liveScore";
import { PAYOUT_CHOICES, type PayoutChoice, type TournamentMeta } from "../pumpfantasy/customTournaments";
import { poolOf } from "../pumpfantasy/tournamentFilters";
import { tournamentDayLabel, tournamentDisplayName } from "../pumpfantasy/tournamentNames";
import { ellipsify } from "../pumpfantasy/format";
import { currencyForMint, decimalsForMint, formatAmountCompact } from "../pumpfantasy/currency";
import { RAKE_BPS, WORKER_URL } from "../pumpfantasy/config";
import { TokenIcon } from "./TokenIcon";
import { EmptyState } from "./EmptyState";
import { ModeBadges, PayoutBadge } from "./ModeBadge";
import { PF_COLORS as C } from "../theme";

type Tab = "mine" | "prizes" | "players" | "rules";
const TABS: { key: Tab; label: string }[] = [
  { key: "mine", label: "My Entries" },
  { key: "prizes", label: "Prizes" },
  { key: "players", label: "Players" },
  { key: "rules", label: "Rules" },
];

export interface TournamentInfoModalProps {
  row: { publicKey: PublicKey; account: TournamentAccount } | null;
  meta: TournamentMeta | undefined;
  onClose: () => void;
  /** "Enter"/"View" in the header — same primary action as the card's own button. */
  ctaLabel: string;
  onPressCta: () => void;
}

// The (i) popup: a tournament's full picture — your own entries, what the prizes are
// worth right now, who else is playing, and the rules — without leaving the list.
export function TournamentInfoModal({ row, meta, onClose, ctaLabel, onPressCta }: TournamentInfoModalProps) {
  const [tab, setTab] = useState<Tab>("mine");
  const insets = useSafeAreaInsets();
  const { selectedAccount } = useAuthorization();
  const { data: candidates } = useCandidates();

  const t = row?.account ?? null;
  const tournamentKey = row?.publicKey ?? null;
  const archivedId = t && isArchivedTournament(t) ? t.id : null;

  const { data: myEntries, isLoading: mineLoading } = useMyEntries(
    tournamentKey,
    selectedAccount?.publicKey ?? null,
    archivedId,
  );
  const { data: allEntries } = useTournamentEntries(tournamentKey, archivedId);

  const candidatesByMint = new Map<string, Candidate>();
  for (const c of candidates ?? []) candidatesByMint.set(c.mint, c);

  const copyLink = async () => {
    if (!t) return;
    const url = `${WORKER_URL}/t/${t.id.toString()}`;
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(url);
    } catch {
      Share.share({ message: url });
    }
  };

  if (!row || !t) return null;
  const payout: PayoutChoice = meta?.payout ?? "p50";
  const payoutLabel = PAYOUT_CHOICES.find((p) => p.key === payout)?.label ?? "50%";
  const pool = poolOf(t);
  const name = tournamentDisplayName(t.id, meta);
  const isPrivate = meta?.visibility === "private";

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header + tabs share one panel — same look as the tab screens' own TopBar: panel colour,
            rounded only at the bottom, content pushed below the status bar. */}
        <View style={styles.panel}>
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
            <View style={styles.headerTop}>
              <View style={styles.badgeRow}>
                <ModeBadges tournament={t} />
                <PayoutBadge label={payoutLabel} />
                {isPrivate ? <FontAwesome6 name="lock" size={12} color={C.textSecondary} /> : null}
              </View>
              <TouchableRipple style={styles.closeButton} borderless onPress={onClose}>
                <FontAwesome6 name="xmark" size={18} color={C.textPrimary} />
              </TouchableRipple>
            </View>
            <View style={styles.headerBottom}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.subtitle}>
                  {t ? tournamentDayLabel(t.startTs) + " · " : ""}Prize pool: {formatAmountCompact(pool, t ? decimalsForMint(t.mint) : 9)} {t ? currencyForMint(t.mint) : "SOL"}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableRipple style={styles.linkButton} borderless onPress={copyLink}>
                  <FontAwesome6 name="link" size={14} color={C.textPrimary} />
                </TouchableRipple>
                <TouchableRipple style={styles.ctaButton} borderless onPress={onPressCta}>
                  <Text style={styles.ctaText} numberOfLines={1}>
                    {ctaLabel}
                  </Text>
                </TouchableRipple>
              </View>
            </View>
          </View>

          <View style={styles.divider} />
          <View style={styles.tabRow}>
            {TABS.map((tb) => (
              <TouchableRipple key={tb.key} style={styles.tab} onPress={() => setTab(tb.key)}>
                <View style={styles.tabInner}>
                  <Text style={[styles.tabText, tab === tb.key ? styles.tabTextActive : undefined]} numberOfLines={1}>
                    {tb.label}
                  </Text>
                  <View style={[styles.tabUnderline, tab === tb.key ? styles.tabUnderlineActive : undefined]} />
                </View>
              </TouchableRipple>
            ))}
          </View>
        </View>

        {tab === "mine" ? (
          <MyEntriesTab
            entries={myEntries ?? []}
            loading={mineLoading}
            candidatesByMint={candidatesByMint}
            entryMode={t.entryMode}
          />
        ) : tab === "prizes" ? (
          <PrizesTab tournament={t} meta={meta} payout={payout} entries={allEntries ?? []} />
        ) : tab === "players" ? (
          <PlayersTab entries={allEntries ?? []} entryMode={t.entryMode} />
        ) : (
          <RulesTab tournament={t} meta={meta} payout={payout} />
        )}
      </View>
    </Modal>
  );
}

function MyEntriesTab({
  entries,
  loading,
  candidatesByMint,
  entryMode,
}: {
  entries: { publicKey: { toBase58(): string }; account: EntryAccount }[];
  loading: boolean;
  candidatesByMint: Map<string, Candidate>;
  entryMode: "single" | "multiple";
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (entries.length === 0) {
    return <EmptyState icon="ghost" label="No Entries" hint="Enter this tournament to see your portfolio here." />;
  }
  // Full width, one row per entry — Multiple mode can hold several, so this scrolls
  // vertically rather than spending the whole screen height on one wide card.
  return (
    <ScrollView style={styles.tabBody} contentContainerStyle={styles.listContent}>
      {entries.map((e) => (
        <View key={e.publicKey.toBase58()} style={styles.entryCard}>
          <View style={styles.entryHead}>
            <Text style={styles.entryTitle}>Portfolio #{e.account.entryIndex + 1}</Text>
            <Text style={styles.entryFoot}>
              {e.account.fpSpent} FP · {e.account.settled ? `Score ${(e.account.scoreBps / 100).toFixed(2)}%` : "Awaiting results"}
            </Text>
          </View>
          <View style={styles.entryPicksRow}>
            {e.account.picks.map((pick, i) => {
              const c = candidatesByMint.get(pick.toBase58());
              return (
                <View key={i} style={styles.pickCell}>
                  {c ? (
                    <>
                      <TokenIcon mint={c.mint} icon={c.icon} symbol={c.symbol} size={20} />
                      <Text style={styles.pickSymbol} numberOfLines={1}>
                        {c.symbol}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.pickSymbol}>?</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function PrizesTab({
  tournament,
  meta,
  payout,
  entries,
}: {
  tournament: TournamentAccount;
  meta: TournamentMeta | undefined;
  payout: PayoutChoice;
  entries: { account: EntryAccount }[];
}) {
  if (tournament.status === "cancelled") {
    return <EmptyState icon="rotate-left" label="Cancelled" hint="Every entry fee was refunded." />;
  }
  if (tournament.entryCount === 0) {
    return <EmptyState icon="trophy" label="No Prizes Yet" hint="They appear once players join." />;
  }

  const finalized = tournament.status === "finalized";
  let rows: { rank: number; amount: bigint }[];
  if (finalized) {
    // The real, possibly-tiered amounts set_prize wrote — grouped so a tie shows as one row
    // ("2 players Ã— 0.045 SOL") instead of two identical lines.
    const winning = entries.map((e) => e.account.prizeLamports).filter((p) => p > 0n).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    rows = [];
    let rank = 1;
    for (let i = 0; i < winning.length; ) {
      let j = i;
      while (j < winning.length && winning[j] === winning[i]) j++;
      rows.push({ rank, amount: winning[i] });
      rank += j - i;
      i = j;
    }
  } else {
    // Projected: what each rank SLOT is worth, assuming nobody ties for it — real ties (and the
    // final amounts) are only known once the round ends.
    const distributable = (poolOf(tournament) * BigInt(10_000 - RAKE_BPS - (meta?.creatorFeeBps ?? 0))) / 10_000n;
    const weights = slotsFor(payout, tournament.entryCount);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    rows = weights.map((w, i) => ({ rank: i + 1, amount: (distributable * BigInt(w)) / BigInt(totalWeight) }));
  }

  return (
    <FlatList
      style={styles.tabBody}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(r) => String(r.rank)}
      // Same row shape as the Players tab, for a consistent look between the two lists.
      renderItem={({ item }) => (
        <View style={styles.playerRow}>
          <FontAwesome6 name="trophy" size={12} color={C.textSecondary} />
          <Text style={styles.playerAddress}>
            {formatAmountCompact(item.amount, decimalsForMint(tournament.mint))} {currencyForMint(tournament.mint)}
          </Text>
          <Text style={styles.playerIndex}>#{item.rank}</Text>
        </View>
      )}
      ListFooterComponent={
        <Text style={styles.prizeHint}>
          {finalized
            ? "A tie splits its place's prize evenly between everyone in it."
            : "Projected per place from the current pool — the final amounts depend on how the round actually ends, including any ties."}
        </Text>
      }
    />
  );
}

function PlayersTab({ entries, entryMode }: { entries: { account: EntryAccount }[]; entryMode: "single" | "multiple" }) {
  if (entries.length === 0) {
    return <EmptyState icon="user-group" label="No Players" hint="Be the first to enter this tournament." />;
  }
  return (
    <FlatList
      style={styles.tabBody}
      contentContainerStyle={styles.listContent}
      data={entries}
      keyExtractor={(e) => e.account.player.toBase58() + e.account.entryIndex}
      renderItem={({ item }) => (
        <View style={styles.playerRow}>
          <FontAwesome6 name="user" size={12} color={C.textSecondary} />
          <Text style={styles.playerAddress}>{ellipsify(item.account.player, 6)}</Text>
          {entryMode === "multiple" ? <Text style={styles.playerIndex}>#{item.account.entryIndex + 1}</Text> : null}
        </View>
      )}
    />
  );
}

function RulesTab({
  tournament,
  meta,
  payout,
}: {
  tournament: TournamentAccount;
  meta: TournamentMeta | undefined;
  payout: PayoutChoice;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(["format"]));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const creatorCut = meta?.creatorFeeBps ?? 0;
  const winnersShareBps = 10_000 - RAKE_BPS - creatorCut;
  const payoutDescription = PAYOUT_CHOICES.find((p) => p.key === payout)?.description ?? "";

  const sections = [
    {
      id: "format",
      title: "Entry types: Single vs Multiple",
      body: `Single tournaments allow one portfolio per wallet. Multiple tournaments let you build as many portfolios as you like, each paying its own entry fee and scoring on its own. This tournament is ${
        tournament.entryMode === "multiple" ? "Multiple — enter it as many times as you like." : "Single — one entry per wallet."
      } Every portfolio picks 5 coins within a 4,000 FP budget.`,
    },
    {
      id: "winners",
      title: "Who wins",
      body: `${payoutDescription} If two or more portfolios tie exactly, they split the prize for the place(s) they're tied for evenly between themselves — so the tournament never pays out more than its plan holds, and a large tie near the cut-off can leave lower places with nothing. Among portfolios tied with each other, the one that entered first is listed higher in the standings — checked by each entry's on-chain timestamp — but that never changes how much any of them actually get; tied entries always split their combined prize equally.`,
    },
    {
      id: "refunds",
      title: "Refunds & cancellations",
      body:
        "If a tournament can't be scored (a coin's price never comes in), it is cancelled and every entry fee is refunded automatically.",
    },
    {
      id: "deposit",
      title: "Refundable deposit",
      body:
        "On top of the entry fee, each entry pays a small refundable deposit of about 0.002–0.008 SOL. It is the rent for the entry's on-chain storage, not a fee: it comes back to your wallet once the tournament ends (or is cancelled) and the round is wrapped up.",
    },
    {
      id: "fees",
      title: "Who pays what",
      body:
        creatorCut > 0
          ? `Winners share ${(winnersShareBps / 100).toFixed(0)}% of the pool. The platform keeps ${(RAKE_BPS / 100).toFixed(0)}%, and this tournament's creator earns ${(creatorCut / 100).toFixed(0)}%, paid straight to their wallet.`
          : `Winners share ${(winnersShareBps / 100).toFixed(0)}% of the pool. The platform keeps ${(RAKE_BPS / 100).toFixed(0)}% as its fee.`,
    },
  ];

  return (
    <ScrollView style={styles.tabBody} contentContainerStyle={styles.listContent}>
      {sections.map((s) => {
        const isOpen = open.has(s.id);
        return (
          <View key={s.id} style={styles.ruleItem}>
            <TouchableRipple onPress={() => toggle(s.id)} style={styles.ruleHeader}>
              <View style={styles.ruleHeaderInner}>
                <Text style={styles.ruleTitle}>{s.title}</Text>
                <FontAwesome6 name={isOpen ? "chevron-up" : "chevron-down"} size={12} color={C.textSecondary} />
              </View>
            </TouchableRipple>
            {isOpen ? <Text style={styles.ruleBody}>{s.body}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

// Both header buttons share this exact box, the same one the card's own link/entry buttons
// use — react-native-paper's TouchableRipple can grow past a bare `height` when its label
// wraps, so the height is fixed AND clipped.
const HEADER_BUTTON_HEIGHT = 34;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // Same shape as the tab screens' own TopBar panel: panel colour, rounded only at the
  // bottom, the tabs living inside it rather than in a separate strip below.
  panel: {
    backgroundColor: C.headerPanel,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    // Clips the active tab's underline so it can never poke out past the rounded corners
    // when the leftmost/rightmost tab (flush against the edge) is the active one.
    overflow: "hidden",
  },
  header: { paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  closeButton: { padding: 6, borderRadius: 999 },
  headerBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 18 },
  subtitle: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkButton: {
    width: HEADER_BUTTON_HEIGHT,
    height: HEADER_BUTTON_HEIGHT,
    borderRadius: HEADER_BUTTON_HEIGHT / 2,
    backgroundColor: C.glassStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ctaButton: {
    minWidth: 76,
    height: HEADER_BUTTON_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ctaText: { color: C.accentTextOn, fontWeight: "800", fontSize: 12.5, includeFontPadding: false },

  divider: { height: 1, backgroundColor: C.cardBorder },
  tabRow: { flexDirection: "row" },
  tab: { flex: 1 },
  tabInner: { alignItems: "center", paddingTop: 12 },
  tabText: { color: C.textSecondary, fontSize: 12.5, fontWeight: "700", paddingBottom: 10 },
  tabTextActive: { color: C.textPrimary },
  tabUnderline: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  tabUnderlineActive: { backgroundColor: C.accent },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyText: { color: C.textSecondary, fontWeight: "700", fontSize: 14, textAlign: "center" },
  emptyHint: { color: C.textSecondary, fontSize: 12, textAlign: "center", marginTop: -4 },

  tabBody: { flex: 1 },
  listContent: { padding: 16, gap: 10 },

  entryCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 10 },
  entryHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, gap: 8 },
  entryTitle: { color: C.textPrimary, fontWeight: "800", fontSize: 13 },
  entryPicksRow: { flexDirection: "row", gap: 6 },
  pickCell: { flex: 1, alignItems: "center", gap: 2 },
  pickSymbol: { color: C.textPrimary, fontWeight: "700", fontSize: 10 },
  entryFoot: { color: C.textSecondary, fontSize: 11 },

  prizeHint: { color: C.textSecondary, fontSize: 11, textAlign: "center", marginTop: 6 },

  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playerAddress: { color: C.textPrimary, fontWeight: "600", fontSize: 13, flex: 1 },
  playerIndex: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },

  ruleItem: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden" },
  ruleHeader: { paddingHorizontal: 14, paddingVertical: 14 },
  ruleHeaderInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ruleTitle: { color: C.textPrimary, fontWeight: "700", fontSize: 14, flexShrink: 1, paddingRight: 8 },
  ruleBody: { color: C.textSecondary, fontSize: 12.5, lineHeight: 19, paddingHorizontal: 14, paddingBottom: 14 },
});
