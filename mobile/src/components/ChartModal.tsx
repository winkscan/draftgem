import { useState } from "react";
import { Linking, Modal, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();

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
        {/* Header + tabs share one panel, same as the tournament popup: panel colour, rounded only at
            the bottom, content pushed below the status bar. */}
        <View style={styles.panel}>
          <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
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
            <View style={styles.headerRight}>
              <View style={styles.priceCol}>
                <Text style={styles.price} numberOfLines={1}>
                  {last != null ? "$" + formatPrice(last) : "—"}
                </Text>
                <Text style={[styles.change, change != null ? { color } : undefined]} numberOfLines={1}>
                  {change != null ? (up ? "+" : "") + change.toFixed(2) + "% · " + range : " "}
                </Text>
              </View>
              <TouchableRipple style={styles.closeButton} borderless onPress={onClose}>
                <FontAwesome6 name="xmark" size={18} color={C.textPrimary} />
              </TouchableRipple>
            </View>
          </View>

          <View style={styles.divider} />
          <View style={styles.tabRow}>
            {(["chart", "about"] as const).map((t) => (
              <TouchableRipple key={t} style={styles.tab} onPress={() => setTab(t)}>
                <View style={styles.tabInner}>
                  <Text style={[styles.tabText, tab === t ? styles.tabTextActive : undefined]}>
                    {t === "chart" ? "Chart" : "About"}
                  </Text>
                  <View style={[styles.tabUnderline, tab === t ? styles.tabUnderlineActive : undefined]} />
                </View>
              </TouchableRipple>
            ))}
          </View>
        </View>

        {tab === "chart" ? (
          <View style={styles.chartTab}>
            <View style={styles.rangeRow}>
              {(Object.keys(CHART_RANGES) as ChartRange[]).map((r) => (
                <TouchableRipple key={r} style={styles.tab} onPress={() => setRange(r)}>
                  <View style={styles.tabInner}>
                    <Text style={[styles.tabText, range === r ? styles.tabTextActive : undefined]}>{r}</Text>
                    <View style={[styles.tabUnderline, range === r ? styles.tabUnderlineActive : undefined]} />
                  </View>
                </TouchableRipple>
              ))}
            </View>

            {candidate ? (
              <View style={[styles.card, styles.statsCard]}>
                <StatRow
                  label="Typical 1-hour move"
                  value={candidate.volatilityPct != null ? "±" + candidate.volatilityPct.toFixed(2) + "%" : "not measured yet"}
                />
                <StatRow label="Category" value={candidate.tier + " · " + candidate.fpCost + " FP"} last />
              </View>
            ) : null}

            {/* Fills all the space left, edge to edge, no border. */}
            <View style={styles.chartArea}>
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
          </View>
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
  panel: {
    backgroundColor: C.headerPanel,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden", // keeps the active underline inside the rounded corners
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 18 },
  subtitle: { color: C.textSecondary, fontSize: 12, maxWidth: 150 },
  closeButton: { padding: 6, borderRadius: 999 },
  divider: { height: 1, backgroundColor: C.cardBorder },
  tabRow: { flexDirection: "row" },
  tab: { flex: 1 },
  tabInner: { alignItems: "center", paddingTop: 12 },
  tabText: { color: C.textSecondary, fontSize: 12.5, fontWeight: "700", paddingBottom: 10 },
  tabTextActive: { color: C.textPrimary },
  tabUnderline: { height: 2, alignSelf: "stretch", backgroundColor: "transparent" },
  tabUnderlineActive: { backgroundColor: C.accent },
  body: { padding: 16, gap: 12 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceCol: { alignItems: "flex-end" },
  price: { color: C.textPrimary, fontWeight: "800", fontSize: 18 },
  change: { fontWeight: "700", fontSize: 12 },
  chartTab: { flex: 1 },
  rangeRow: { flexDirection: "row" },
  statsCard: { marginHorizontal: 16, marginTop: 4 },
  chartArea: { flex: 1, marginTop: 16 },
  chartPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
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
