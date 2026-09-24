import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { DraftGemLogo } from "./brand/DraftGemLogo";
import { PnlChart } from "./PnlChart";
import { PnlShareModal } from "./PnlShareModal";
import { PNL_PERIODS, PNL_PERIOD_LABEL, buildPnlSeries, formatUsd, type PnlPeriod } from "../pumpfantasy/pnlSeries";
import { PF_COLORS as C } from "../theme";

// The profit / loss card on the profile page: title and period tabs, the amount with a share button,
// the period's name, and the chart.
export function PnlCard({ events, address }: { events: { t: number; usd: number }[]; address: string }) {
  const [period, setPeriod] = useState<PnlPeriod>("1D");
  const [shareOpen, setShareOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);
  const series = useMemo(() => buildPnlSeries(events, period, Math.floor(Date.now() / 1000)), [events, period]);
  const total = series.total;
  const tone = total > 0.005 ? C.positive : total < -0.005 ? C.negative : C.textSecondary;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <FontAwesome6 name={total >= 0 ? "caret-up" : "caret-down"} size={14} color={tone} />
          <Text style={styles.title}>Profit/Loss</Text>
        </View>
        <View style={styles.tabs}>
          {PNL_PERIODS.map((p) => (
            <TouchableRipple key={p} borderless style={[styles.tab, period === p ? styles.tabActive : undefined]} onPress={() => setPeriod(p)}>
              <Text style={[styles.tabText, period === p ? styles.tabTextActive : undefined]}>{p}</Text>
            </TouchableRipple>
          ))}
        </View>
      </View>

      <View style={styles.amountRow}>
        <View style={styles.amountLeft}>
          <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
            {formatUsd(total)}
          </Text>
          <TouchableRipple borderless style={styles.shareButton} onPress={() => setShareOpen(true)} accessibilityLabel="Share profit and loss">
            <FontAwesome6 name="arrow-up-from-bracket" size={15} color={C.textPrimary} />
          </TouchableRipple>
        </View>
        <View style={styles.logo}>
          <DraftGemLogo height={22} />
        </View>
      </View>
      <Text style={styles.period}>{PNL_PERIOD_LABEL[period]}</Text>

      <View style={styles.chart} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
        <PnlChart points={series.points} width={chartWidth} height={120} idPrefix="pnlCard" />
      </View>

      <PnlShareModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        address={address}
        period={period}
        total={total}
        points={series.points}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 16 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: C.textSecondary, fontWeight: "700", fontSize: 14 },
  tabs: { flexDirection: "row", gap: 2 },
  tab: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 10 },
  tabActive: { backgroundColor: C.accentTint },
  tabText: { color: C.textSecondary, fontWeight: "700", fontSize: 11.5 },
  tabTextActive: { color: C.accentText },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  amountLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  amount: { color: C.textPrimary, fontWeight: "800", fontSize: 36, flexShrink: 1 },
  shareButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  logo: { opacity: 0.45 },
  period: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
  chart: { marginTop: 14, marginHorizontal: -16, marginBottom: -16, height: 120, overflow: "hidden", borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
});
