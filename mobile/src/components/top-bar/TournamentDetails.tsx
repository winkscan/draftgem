import { useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { TournamentAccount } from "../../pumpfantasy/accounts";
import { PAYOUT_CHOICES, type TournamentMeta } from "../../pumpfantasy/customTournaments";
import { currencyForMint, decimalsForMint, formatAmountCompact } from "../../pumpfantasy/currency";
import { formatCountdown, formatDuration } from "../../pumpfantasy/format";
import { payoutStructureOf, poolOf } from "../../pumpfantasy/tournamentFilters";
import { tournamentDayLabel, tournamentDisplayName } from "../../pumpfantasy/tournamentNames";
import { getTournamentPhase } from "../../pumpfantasy/tournamentPhase";
import { WORKER_URL } from "../../pumpfantasy/config";
import { ModeBadges, PayoutBadge } from "../ModeBadge";
import { PF_COLORS as C } from "../../theme";

// What the header shows on a tournament's own page in place of the lobby's filters: the same
// card facts (badges, title, info button; players / duration / countdown; link), inside the panel.
export function TournamentDetails({
  tournament: t,
  meta,
  onOpenInfo,
}: {
  tournament: TournamentAccount;
  meta: TournamentMeta | undefined;
  onOpenInfo: () => void;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const payout = payoutStructureOf(t, meta ? { [t.id.toString()]: meta } : undefined);
  const payoutLabel = PAYOUT_CHOICES.find((p) => p.key === payout)?.label ?? "50%";
  const decimals = decimalsForMint(t.mint);
  const title = `${formatAmountCompact(poolOf(t), decimals)} ${currencyForMint(t.mint)} ${tournamentDayLabel(t.startTs)} ${tournamentDisplayName(t.id, meta)}`;

  const phase = getTournamentPhase(t, now);
  const [thirdLabel, thirdValue] =
    phase === "upcoming"
      ? ["Starts in", formatCountdown(Number(t.startTs), now)]
      : phase === "live"
        ? ["Ends in", formatCountdown(Number(t.endTs), now)]
        : ["Status", t.status === "finalized" ? "Paid out" : t.status === "cancelled" ? "Cancelled" : "Awaiting results"];

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

  return (
    <View>
      <View style={styles.divider} />
      <View style={styles.body}>
        <View style={styles.row1}>
          <View style={styles.titleWrap}>
            <ModeBadges tournament={t} />
            <PayoutBadge label={payoutLabel} />
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <TouchableRipple style={styles.iconButton} borderless onPress={onOpenInfo}>
            <FontAwesome6 name="circle-info" size={18} color={C.textOnHeader} />
          </TouchableRipple>
        </View>
        <View style={styles.row2}>
          <View style={styles.stats}>
            <Stat value={String(t.entryCount)} label="Players" />
            <Stat value={formatDuration(Number(t.endTs - t.startTs))} label="Duration" />
            <Stat value={thirdValue} label={thirdLabel} />
          </View>
          <TouchableRipple style={styles.iconButton} borderless onPress={copyLink}>
            <FontAwesome6 name={copied ? "check" : "link"} size={16} color={copied ? C.accent2 : C.textOnHeader} />
          </TouchableRipple>
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: C.cardBorder },
  body: { paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  row1: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: C.textOnHeader, fontWeight: "700", fontSize: 15, flexShrink: 1 },
  row2: { flexDirection: "row", alignItems: "center", gap: 8 },
  stats: { flex: 1, flexDirection: "row" },
  stat: { flex: 1, gap: 1 },
  statValue: { color: C.textOnHeader, fontWeight: "800", fontSize: 15 },
  statLabel: { color: C.textOnHeaderMuted, fontSize: 11 },
  iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
