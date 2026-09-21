import { useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { usePoolAddress } from "../pumpfantasy/poolAddress";
import { CHART_RANGES, usePriceSeries, useTokenAbout, type ChartRange } from "../pumpfantasy/chartData";
import type { Candidate } from "../pumpfantasy/candidates";
import { formatAge, formatPrice, formatUsdCompact } from "../pumpfantasy/format";
import { TokenIcon } from "./TokenIcon";
import { PriceChart } from "./PriceChart";
import { PF_COLORS as C } from "../theme";

// In-app coin details: a natively drawn price chart (candles from
// GeckoTerminal's free API, see chartData.ts) and an About tab (the numbers we
// already have from /candidates, plus the project's links).
export function ChartModal({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  const [tab, setTab] = useState<"chart" | "about">("chart");
  const [range, setRange] = useState<ChartRange>("24H");
  const mint = candidate?.mint ?? null;

  const { data: pool, isLoading: poolLoading } = usePoolAddress(mint);
  const { data: points, isLoading: seriesLoading, isError } = usePriceSeries(pool, range);
  const { data: about } = useTokenAbout(candidate, tab === "about");

  const first = points?.[0]?.price;
  const last = points?.[points.length - 1]?.price;
  const change = first && last ? ((last - first) / first) * 100 : null;
  const up = (change ?? 0) >= 0;
  const color = up ? C.positive : C.negative;

  return (
    <Modal visible={!!candidate} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {candidate ? (
              <TokenIcon mint={candidate.mint} icon={candidate.icon} symbol={candidate.symbol} size={32} />
            ) : null}
            <View>
              <Text style={styles.title}>{candidate?.symbol}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {candidate?.name}
              </Text>
            </View>
          </View>
          <TouchableRipple style={styles.closeButton} borderless onPress={onClose}>
            <FontAwesome6 name="xmark" size={18} color={C.textPrimary} />
          </TouchableRipple>
        </View>

        <View style={styles.tabRow}>
          {(["chart", "about"] as const).map((t) => (
            <TouchableRipple
              key={t}
              style={[styles.tab, tab === t ? styles.tabActive : undefined]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t ? styles.tabTextActive : undefined]}>
                {t === "chart" ? "Chart" : "About"}
              </Text>
            </TouchableRipple>
          ))}
        </View>

        {tab === "chart" ? (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{last != null ? `$${formatPrice(last)}` : "—"}</Text>
              {change != null ? (
                <Text style={[styles.change, { color }]}>
                  {up ? "+" : ""}
                  {change.toFixed(2)}% · {range}
                </Text>
              ) : null}
            </View>

            <View style={styles.rangeRow}>
              {(Object.keys(CHART_RANGES) as ChartRange[]).map((r) => (
                <TouchableRipple
                  key={r}
                  style={[styles.rangePill, range === r ? styles.rangePillActive : undefined]}
                  onPress={() => setRange(r)}
                >
                  <Text style={[styles.rangeText, range === r ? styles.rangeTextActive : undefined]}>{r}</Text>
                </TouchableRipple>
              ))}
            </View>

            <View style={styles.chartCard}>
              {poolLoading || seriesLoading ? (
                <View style={styles.chartPlaceholder}>
                  <ActivityIndicator color={C.accent} />
                </View>
              ) : !pool || isError || !points || points.length < 2 ? (
                <View style={styles.chartPlaceholder}>
                  <Text style={{ color: C.textSecondary }}>No chart data for this coin yet.</Text>
                </View>
              ) : (
                <PriceChart points={points} color={color} />
              )}
            </View>
            <Text style={styles.hint}>Touch and drag on the chart to see the price at any moment.</Text>

            {candidate ? (
              <View style={styles.card}>
                <StatRow
                  label="Typical 10-min move"
                  value={candidate.volatilityPct != null ? `±${candidate.volatilityPct.toFixed(2)}%` : "not measured yet"}
                />
                <StatRow label="Category" value={`${candidate.tier} · ${candidate.fpCost} FP`} last />
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {candidate ? (
              <View style={styles.card}>
                <StatRow label="Market cap" value={formatUsdCompact(candidate.marketCapUsd)} />
                <StatRow label="Liquidity" value={formatUsdCompact(candidate.liquidityUsd)} />
                <StatRow label="Age" value={formatAge(candidate.ageDays)} last />
              </View>
            ) : null}

            {about && about.links.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Links</Text>
                <View style={styles.linksWrap}>
                  {about.links.map((l) => (
                    <TouchableRipple key={l.url} style={styles.linkPill} onPress={() => Linking.openURL(l.url)}>
                      <Text style={styles.linkText}>{l.label}</Text>
                    </TouchableRipple>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.statRow, last ? { borderBottomWidth: 0 } : undefined]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 18 },
  subtitle: { color: C.textSecondary, fontSize: 12, maxWidth: 220 },
  closeButton: { padding: 10, borderRadius: 999 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  tabActive: { backgroundColor: C.accent, borderColor: C.accent },
  tabText: { color: C.textSecondary, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: C.textOnHeader },
  body: { padding: 16, gap: 12 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  price: { color: C.textPrimary, fontWeight: "800", fontSize: 26 },
  change: { fontWeight: "700", fontSize: 14 },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangePill: {
    flex: 1,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  rangePillActive: { backgroundColor: C.accent, borderColor: C.accent },
  rangeText: { color: C.textSecondary, fontWeight: "700", fontSize: 12 },
  rangeTextActive: { color: C.accentTextOn },
  chartCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingVertical: 8,
    overflow: "hidden",
  },
  chartPlaceholder: { height: 230, alignItems: "center", justifyContent: "center" },
  hint: { color: C.textSecondary, fontSize: 11, textAlign: "center" },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
  },
  sectionTitle: { color: C.textPrimary, fontWeight: "700", fontSize: 14, marginBottom: 8 },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  statLabel: { color: C.textSecondary, fontSize: 13 },
  statValue: { color: C.textPrimary, fontWeight: "700", fontSize: 13 },
  linksWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  linkPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.accent2Tint,
  },
  linkText: { color: C.accent2, fontWeight: "700", fontSize: 12 },
});
