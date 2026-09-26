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
import { useCoinMap } from "../pumpfantasy/coinLookup";
import { EmptyState } from "./EmptyState";
import { PortfolioCard, entryBadge } from "./PortfolioCard";
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
  ctaLabel?: string;
  onPressCta?: () => void;
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

  const candidatesByMint = useCoinMap((myEntries ?? []).flatMap((e) => e.account.picks.map((p) => p.toBase58())));

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
                <TouchableRipple style={styles.backButton} borderless onPress={onClose}>
                  <FontAwesome6 name="chevron-left" size={16} color={C.textPrimary} />
                </TouchableRipple>
                <ModeBadges tournament={t} />
                <PayoutBadge label={payoutLabel} />
                {isPrivate ? <FontAwesome6 name="lock" size={12} color={C.textSecondary} /> : null}
              </View>
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
                {ctaLabel ? (
                  <TouchableRipple style={styles.ctaButton} borderless onPress={onPressCta}>
                    <Text style={styles.ctaText} numberOfLines={1}>
                      {ctaLabel}
                    </Text>
                  </TouchableRipple>
                ) : null}
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
            tournament={t}
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
  tournament,
}: {
  entries: { publicKey: { toBase58(): string }; account: EntryAccount }[];
  loading: boolean;
  candidatesByMint: Map<string, Candidate>;
  entryMode: "single" | "multiple";
  tournament: TournamentAccount;
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
        <PortfolioCard
          key={e.publicKey.toBase58()}
          portfolioNo={e.account.entryIndex + 1}
          badge={entryBadge(tournament)}
          slots={e.account.picks.map((pick, i) => ({ key: String(i), candidate: candidatesByMint.get(pick.toBase58()) }))}
        />
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
    // The real, possibly-tiered amounts set_prize wrote: one row per winning place, even when
    // amounts repeat (a tie for 1st shows 1st and 2nd with the same prize), so it's clear every
    // one of those places gets paid.
    const winning = entries.map((e) => e.account.prizeLamports).filter((p) => p > 0n).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    rows = winning.map((amount, i) => ({ rank: i + 1, amount }));
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
      id: "results",
      title: "How results are calculated",
      body:
        "Each coin's result is its % change from its start price to its end price, and a coin can lose at most 100%. A portfolio's score is the SUM of its 5 coins' results, not the average. Portfolios are ranked by score, and the prizes go by that ranking. The score is calculated by the on-chain program itself from the recorded prices, so nobody can change it afterwards. The standings during a round use current market prices and can differ from the final result.",
    },
    {
      id: "prices",
      title: "Where prices come from",
      body:
        "The coin list and each coin's category come from Jupiter's token lists (verified and trending Solana coins), limited to coins with real liquidity and market cap; stablecoins are left out. A coin's start and end price are the price at exactly the start and end second of the round, taken from the minute candles of its deepest trading pool (GeckoTerminal, the pool is found through DexScreener). If that history isn't available yet, a live price (Jupiter, DexScreener) stands in for up to 15 minutes. Our backend records each price on chain once, so every player in a tournament is scored on the same numbers. A price that looks wrong, far from the live price, is rejected and retried instead of being written. Before any payout an automatic check re-calculates every score and prize; if anything doesn't add up, the payout is held instead of paid.",
    },
    {
      id: "ai",
      title: "AI portfolio",
      body:
        "On the draft page, the AI button builds a 5-coin portfolio for you. Choose a risk level on the slider, from Steady (calm coins) to Moonshot (the wildest coins the budget allows), press Generate, and use the result as it is or change it by hand. It works like this: a language model (Google Gemini) is given a list of the most liquid coins of every category with their FP price, typical hourly move, market cap, liquidity and age, and picks five that fit your risk level, with a short reason for each. Every answer is checked before you see it: five different coins from the list, and a total price within the 4,000 FP budget (if it goes over, the priciest picks are swapped for ones that fit). The AI sees only public coin data, never your wallet. It does not predict prices and does not promise a good result: the score still depends on how the market moves. Each wallet gets 5 free generations per day (the counter is shown at the top of the AI page and renews at 00:00 UTC). If the AI's free credits run out, it pauses until they renew.",
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
      title: "Fees",
      body:
        creatorCut > 0
          ? `Winners share ${(winnersShareBps / 100).toFixed(0)}% of the pool. The platform keeps ${(RAKE_BPS / 100).toFixed(0)}%, and this tournament's creator earns ${(creatorCut / 100).toFixed(0)}%, paid straight to their wallet. The entry fee is the only thing that goes into the pool; the refundable deposit is separate.`
          : `Winners share ${(winnersShareBps / 100).toFixed(0)}% of the pool. The platform keeps ${(RAKE_BPS / 100).toFixed(0)}% as its fee. The entry fee is the only thing that goes into the pool; the refundable deposit is separate.`,
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
  backButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: -6 },
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
