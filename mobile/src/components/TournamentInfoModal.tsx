import { useState } from "react";
import { FlatList, Modal, ScrollView, Share, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { PublicKey } from "@solana/web3.js";
import type { TournamentAccount, EntryAccount } from "../pumpfantasy/hooks";
import { useMyEntries, useTournamentEntries, isArchivedTournament } from "../pumpfantasy/hooks";
import { useCandidates, type Candidate } from "../pumpfantasy/candidates";
import { useAuthorization } from "../utils/useAuthorization";
import { winnerTarget } from "../pumpfantasy/liveScore";
import { PAYOUT_CHOICES, type PayoutChoice, type TournamentMeta } from "../pumpfantasy/customTournaments";
import { poolOf } from "../pumpfantasy/tournamentFilters";
import { tournamentDisplayName } from "../pumpfantasy/tournamentNames";
import { ellipsify, formatSol, formatSolCompact } from "../pumpfantasy/format";
import { RAKE_BPS, WORKER_URL } from "../pumpfantasy/config";
import { TokenIcon } from "./TokenIcon";
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
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.badgeRow}>
              <ModeBadges tournament={t} />
              <PayoutBadge label={payoutLabel} />
              {isPrivate ? <FontAwesome6 name="lock" size={12} color={C.textOnHeaderMuted} /> : null}
            </View>
            <TouchableRipple style={styles.closeButton} borderless onPress={onClose}>
              <FontAwesome6 name="xmark" size={18} color={C.textOnHeader} />
            </TouchableRipple>
          </View>
          <View style={styles.headerBottom}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.subtitle}>Prize pool: {formatSolCompact(pool)} SOL</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableRipple style={styles.linkButton} borderless onPress={copyLink}>
                <FontAwesome6 name="link" size={14} color={C.textOnHeader} />
              </TouchableRipple>
              <TouchableRipple style={styles.ctaButton} borderless onPress={onPressCta}>
                <Text style={styles.ctaText} numberOfLines={1}>
                  {ctaLabel}
                </Text>
              </TouchableRipple>
            </View>
          </View>
        </View>

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

        {tab === "mine" ? (
          <MyEntriesTab
            entries={myEntries ?? []}
            loading={mineLoading}
            candidatesByMint={candidatesByMint}
            entryMode={t.entryMode}
          />
        ) : tab === "prizes" ? (
          <PrizesTab tournament={t} meta={meta} payout={payout} />
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
    return (
      <View style={styles.center}>
        <FontAwesome6 name="ghost" size={44} color={C.disabled} />
        <Text style={styles.emptyText}>No Entries</Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.tabBody}
      contentContainerStyle={styles.entriesScrollContent}
      horizontal={entryMode === "multiple"}
      showsHorizontalScrollIndicator={false}
    >
      {entries.map((e) => (
        <View key={e.publicKey.toBase58()} style={[styles.entryCard, entryMode === "multiple" ? styles.entryCardWide : undefined]}>
          <Text style={styles.entryTitle}>Portfolio #{e.account.entryIndex + 1}</Text>
          <View style={styles.entryPicksRow}>
            {e.account.picks.map((pick, i) => {
              const c = candidatesByMint.get(pick.toBase58());
              return (
                <View key={i} style={styles.pickCell}>
                  {c ? (
                    <>
                      <TokenIcon mint={c.mint} icon={c.icon} symbol={c.symbol} size={22} />
                      <Text style={styles.pickSymbol} numberOfLines={1}>
                        {c.symbol}
                      </Text>
                      <Text style={styles.pickTier} numberOfLines={1}>
                        {c.tier}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.pickSymbol}>?</Text>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.entryFoot}>
            Spent {e.account.fpSpent} FP · {e.account.settled ? `Score ${(e.account.scoreBps / 100).toFixed(2)}%` : "Awaiting results"}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function PrizesTab({
  tournament,
  meta,
  payout,
}: {
  tournament: TournamentAccount;
  meta: TournamentMeta | undefined;
  payout: PayoutChoice;
}) {
  if (tournament.status === "cancelled") {
    return (
      <View style={styles.center}>
        <FontAwesome6 name="rotate-left" size={32} color={C.disabled} />
        <Text style={styles.emptyText}>Cancelled — every entry fee was refunded.</Text>
      </View>
    );
  }
  if (tournament.entryCount === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No entries yet — prizes will appear once players join.</Text>
      </View>
    );
  }

  const finalized = tournament.status === "finalized";
  const winners = finalized ? tournament.winnersCount : winnerTarget(payout, tournament.entryCount);
  const distributable = finalized
    ? tournament.distributedPoolLamports
    : (poolOf(tournament) * BigInt(10_000 - RAKE_BPS - (meta?.creatorFeeBps ?? 0))) / 10_000n;
  const share = winners > 0 ? distributable / BigInt(winners) : 0n;

  return (
    <FlatList
      style={styles.tabBody}
      contentContainerStyle={styles.listContent}
      data={Array.from({ length: winners }, (_, i) => i)}
      keyExtractor={(i) => String(i)}
      ListHeaderComponent={
        !finalized ? (
          <Text style={styles.prizeHint}>
            Projected from the current pool — every score at the cut-off wins, so the final count can widen on a tie.
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={styles.prizeRow}>
          <Text style={styles.prizeRank}>{item + 1}</Text>
          <Text style={styles.prizeAmount}>{formatSol(share, 4)} SOL</Text>
        </View>
      )}
    />
  );
}

function PlayersTab({ entries, entryMode }: { entries: { account: EntryAccount }[]; entryMode: "single" | "multiple" }) {
  if (entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No players have entered yet.</Text>
      </View>
    );
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
      title: "Format",
      body:
        tournament.entryMode === "multiple"
          ? "Multiple entries: build as many portfolios as you like, each its own entry fee. Every entry picks 5 coins within a 4,000 FP budget."
          : "Single entry: one portfolio per wallet. Pick 5 coins within a 4,000 FP budget.",
    },
    { id: "winners", title: "Who wins", body: `${payoutDescription} A tie right at the cut-off widens the winner set, so it never pays out less than it holds.` },
    {
      id: "refunds",
      title: "Refunds & cancellations",
      body:
        "If a tournament can't be scored (a coin's price never comes in), it is cancelled and every entry fee is refunded automatically. Either way, the small refundable deposit each entry pays for its on-chain storage (about 0.002–0.008 SOL) comes back to your wallet once the round is wrapped up.",
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.header, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 12 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  closeButton: { padding: 6, borderRadius: 999 },
  headerBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: C.textOnHeader, fontWeight: "800", fontSize: 18 },
  subtitle: { color: C.textOnHeaderMuted, fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.glassStrong, alignItems: "center", justifyContent: "center" },
  ctaButton: { height: 34, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.accentTextOn, fontWeight: "800", fontSize: 13 },

  tabRow: { flexDirection: "row", backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  tab: { flex: 1 },
  tabInner: { alignItems: "center", paddingTop: 12 },
  tabText: { color: C.textSecondary, fontSize: 12.5, fontWeight: "700", paddingBottom: 10 },
  tabTextActive: { color: C.textPrimary },
  tabUnderline: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  tabUnderlineActive: { backgroundColor: C.accent },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyText: { color: C.textSecondary, fontWeight: "700", fontSize: 14, textAlign: "center" },

  tabBody: { flex: 1 },
  listContent: { padding: 16, gap: 10 },

  entriesScrollContent: { padding: 16, gap: 12 },
  entryCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 14 },
  entryCardWide: { width: 260 },
  entryTitle: { color: C.textPrimary, fontWeight: "800", fontSize: 14, marginBottom: 10 },
  entryPicksRow: { flexDirection: "row", gap: 6 },
  pickCell: { flex: 1, alignItems: "center", gap: 2 },
  pickSymbol: { color: C.textPrimary, fontWeight: "700", fontSize: 10 },
  pickTier: { color: C.textSecondary, fontSize: 8 },
  entryFoot: { color: C.textSecondary, fontSize: 11, marginTop: 10 },

  prizeHint: { color: C.textSecondary, fontSize: 11, marginBottom: 4 },
  prizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  prizeRank: { color: C.textSecondary, fontWeight: "700", fontSize: 13, width: 20 },
  prizeAmount: { color: C.textPrimary, fontWeight: "800", fontSize: 15, flex: 1, textAlign: "center" },

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
