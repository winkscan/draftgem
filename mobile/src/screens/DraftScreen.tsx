import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, TouchableRipple } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useConnection } from "../utils/ConnectionProvider";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import {
  useTournament,
  useTournamentAssets,
  useMyEntry,
  useMyEntries,
  TournamentAssetAccount,
  EntryAccount,
} from "../pumpfantasy/hooks";
import { enterTournament } from "../pumpfantasy/actions";
import { tournamentPda } from "../pumpfantasy/pdas";
import { MAX_BUDGET_FP, PICKS_PER_ENTRY } from "../pumpfantasy/config";
import { ellipsify, formatSol } from "../pumpfantasy/format";
import { useTokenInfos } from "../pumpfantasy/tokenInfo";
import { TokenIcon } from "../components/TokenIcon";
import { ModeBadges } from "../components/ModeBadge";
import { PF_COLORS as C } from "../theme";

type AssetRow = { publicKey: import("@solana/web3.js").PublicKey; account: TournamentAssetAccount };

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
  const { data: assets, isLoading: assetsLoading } = useTournamentAssets(tournament ? tournamentPubkey : null);
  // Both hooks are called unconditionally (rules of hooks) — only the one
  // matching this tournament's entryMode is actually used below.
  const { data: myEntry } = useMyEntry(tournament ? tournamentPubkey : null, selectedAccount?.publicKey ?? null);
  const { data: myEntries } = useMyEntries(tournament ? tournamentPubkey : null, selectedAccount?.publicKey ?? null);

  const isMultiple = tournament?.entryMode === "multiple";
  const [tab, setTab] = useState<"draft" | "mine">("draft");

  const mints = useMemo(() => (assets ?? []).map((a) => a.account.mint.toBase58()), [assets]);
  const { data: tokenInfos } = useTokenInfos(mints);

  const [picked, setPicked] = useState<AssetRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spentFp = useMemo(() => picked.reduce((sum, a) => sum + a.account.fpCost, 0), [picked]);
  const remainingFp = MAX_BUDGET_FP - spentFp;

  // Single mode + already entered: show the portfolio you actually built,
  // not just a summary line — resolve the stored pick pubkeys back to
  // their TournamentAsset rows so the same icon/symbol slots render.
  const viewingExistingSingleEntry = !isMultiple && !!myEntry;
  const displayedSlots: (AssetRow | undefined)[] = viewingExistingSingleEntry
    ? myEntry!.picks.map((pick) => (assets ?? []).find((a) => a.publicKey.equals(pick)))
    : Array.from({ length: PICKS_PER_ENTRY }, (_, i) => picked[i]);

  const togglePick = (row: AssetRow) => {
    setError(null);
    const already = picked.find((p) => p.publicKey.equals(row.publicKey));
    if (already) {
      setPicked(picked.filter((p) => !p.publicKey.equals(row.publicKey)));
      return;
    }
    if (picked.length >= PICKS_PER_ENTRY) {
      setError(`Only ${PICKS_PER_ENTRY} picks allowed — remove one first.`);
      return;
    }
    if (row.account.fpCost > remainingFp) {
      setError("Not enough FP budget left for this coin.");
      return;
    }
    setPicked([...picked, row]);
  };

  const entriesClosed = !!tournament && Math.floor(Date.now() / 1000) >= Number(tournament.startTs);
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
      const entryIndex = isMultiple ? myEntries?.length ?? 0 : 0;
      await enterTournament(
        connection,
        player,
        signAndSendTransaction,
        id,
        picked.map((p) => p.publicKey),
        entryIndex,
      );
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

  if (!tournament || assetsLoading) {
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
        <MyEntriesList entries={myEntries ?? []} assets={assets ?? []} tokenInfos={tokenInfos} />
      ) : (
        <>
          <View style={styles.budgetBar}>
            <Text style={styles.budgetLabel}>{viewingExistingSingleEntry ? "Your portfolio" : "Budget left"}</Text>
            {!viewingExistingSingleEntry ? (
              <Text style={[styles.budgetValue, remainingFp < 0 ? { color: C.negative } : undefined]}>
                {remainingFp} / {MAX_BUDGET_FP} FP
              </Text>
            ) : null}
          </View>

          <View style={styles.slotsRow}>
            {displayedSlots.map((row, i) => {
              const info = row ? tokenInfos?.[row.account.mint.toBase58()] : undefined;
              return (
                <View key={i} style={styles.slot}>
                  {row ? (
                    <>
                      <TokenIcon
                        mint={row.account.mint.toBase58()}
                        icon={info?.icon}
                        symbol={info?.symbol ?? ellipsify(row.account.mint, 2)}
                        size={22}
                      />
                      <Text style={styles.slotMint} numberOfLines={1}>
                        {info?.symbol ?? ellipsify(row.account.mint, 3)}
                      </Text>
                      <Text style={styles.slotFp}>{row.account.fpCost} FP</Text>
                    </>
                  ) : (
                    <FontAwesome6 name="plus" size={14} color={C.disabled} />
                  )}
                </View>
              );
            })}
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
              <Text style={{ color: C.negative, fontWeight: "700" }}>Entries are closed</Text>
              <Text style={{ color: C.textSecondary, fontSize: 12 }}>This tournament's round already started.</Text>
            </View>
          ) : null}

          <FlatList
            style={styles.list}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            data={assets ?? []}
            keyExtractor={(row) => row.publicKey.toBase58()}
            renderItem={({ item }) => {
              const isPicked = !!picked.find((p) => p.publicKey.equals(item.publicKey));
              const mint = item.account.mint.toBase58();
              const info = tokenInfos?.[mint];
              return (
                <TouchableRipple
                  style={[styles.assetRow, isPicked ? styles.assetRowPicked : undefined]}
                  onPress={() => togglePick(item)}
                  disabled={blockedBySingleEntry || entriesClosed}
                >
                  <View style={styles.assetRowInner}>
                    <View style={styles.assetRowLeft}>
                      <TokenIcon mint={mint} icon={info?.icon} symbol={info?.symbol ?? ellipsify(mint, 2)} size={28} />
                      <View>
                        <Text style={styles.assetSymbol}>{info?.symbol ?? ellipsify(mint, 5)}</Text>
                        <Text style={styles.assetName} numberOfLines={1}>
                          {info?.name ?? "Loading…"}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.assetFp, isPicked ? { color: C.accent } : undefined]}>
                      {item.account.fpCost} FP
                    </Text>
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
                  ? "Entries Closed"
                  : selectedAccount
                    ? `Enter for ${formatSol(tournament.entryFeeLamports, 2)} SOL`
                    : "Connect & Enter"}
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

function MyEntriesList({
  entries,
  assets,
  tokenInfos,
}: {
  entries: { publicKey: import("@solana/web3.js").PublicKey; account: EntryAccount }[];
  assets: AssetRow[];
  tokenInfos: Record<string, import("../pumpfantasy/tokenInfo").TokenInfo> | undefined;
}) {
  if (entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: C.textSecondary }}>No entries yet — build one on the "New Entry" tab.</Text>
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
        const picks = item.account.picks.map((pick) => assets.find((a) => a.publicKey.equals(pick)));
        return (
          <View style={styles.entryCard}>
            <Text style={{ color: C.textPrimary, fontWeight: "700" }}>Portfolio #{item.account.entryIndex + 1}</Text>
            <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 2, marginBottom: 10 }}>
              Spent {item.account.fpSpent} FP ·{" "}
              {item.account.settled ? `Score ${item.account.scoreBps / 100}%` : "Awaiting results"}
            </Text>
            <View style={styles.entrySlotsRow}>
              {picks.map((row, i) => {
                const info = row ? tokenInfos?.[row.account.mint.toBase58()] : undefined;
                return (
                  <View key={i} style={styles.entrySlot}>
                    {row ? (
                      <>
                        <TokenIcon
                          mint={row.account.mint.toBase58()}
                          icon={info?.icon}
                          symbol={info?.symbol ?? ellipsify(row.account.mint, 2)}
                          size={20}
                        />
                        <Text style={styles.slotMint} numberOfLines={1}>
                          {info?.symbol ?? ellipsify(row.account.mint, 3)}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.slotMint}>?</Text>
                    )}
                  </View>
                );
              })}
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
  slotFp: { fontSize: 10, color: C.accent, fontWeight: "700" },
  error: { color: C.negative, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  alreadyIn: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#e9f9ef",
  },
  closedBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff0f0",
  },
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
  assetRowPicked: { borderColor: C.accent, backgroundColor: "#fff0f1" },
  assetRowInner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  assetRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  assetSymbol: { color: C.textPrimary, fontWeight: "700", fontSize: 14 },
  assetName: { color: C.textSecondary, fontSize: 11, maxWidth: 160 },
  assetFp: { color: C.textSecondary, fontWeight: "700", fontSize: 13 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.cardBorder,
    backgroundColor: C.card,
  },
});
