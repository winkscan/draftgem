import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation, useRoute } from "@react-navigation/native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useCandidates, type Candidate } from "../pumpfantasy/candidates";
import { RISK_LEVELS, fetchAiPortfolio, setPendingAiPicks, type AiResult } from "../pumpfantasy/aiPortfolio";
import { BottomBar } from "../components/BottomBar";
import { EmptyState } from "../components/EmptyState";
import { PortfolioCard } from "../components/PortfolioCard";
import { RiskSlider } from "../components/RiskSlider";
import { PF_COLORS as C } from "../theme";

// The AI page: pick how risky the portfolio should be, press Generate and Claude builds one. Every
// press replaces the current portfolio with a new one; "Use portfolio" hands it to the draft page.
export function AiPortfolioScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { tournamentId } = route.params as { tournamentId: string };
  const { data: candidates } = useCandidates();
  const byMint = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of candidates ?? []) m.set(c.mint, c);
    return m;
  }, [candidates]);

  const [risk, setRisk] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      // Ask for something different from what's on screen.
      setResult(await fetchAiPortfolio(risk, result?.picks.map((p) => p.mint) ?? []));
    } catch (e: any) {
      setResult(null);
      setError(e?.message ?? "The AI could not build a portfolio right now");
    } finally {
      setLoading(false);
    }
  };

  const usePortfolio = () => {
    if (!result) return;
    setPendingAiPicks(tournamentId, result.picks.map((p) => p.mint));
    navigation.goBack();
  };

  const level = RISK_LEVELS[risk];
  const resultLevel = result ? RISK_LEVELS[result.risk] : null;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.riskHead}>
          <Text style={styles.riskTitle}>Risk level</Text>
          <Text style={styles.riskName}>{level.name}</Text>
        </View>
        <RiskSlider value={risk} steps={RISK_LEVELS.length} onChange={setRisk} />
        <View style={styles.ends}>
          <Text style={styles.endText}>{RISK_LEVELS[0].name}</Text>
          <Text style={styles.endText}>{RISK_LEVELS[RISK_LEVELS.length - 1].name}</Text>
        </View>
        <Text style={styles.riskDescription}>{level.description}</Text>

        <TouchableRipple style={[styles.generate, loading ? styles.generateBusy : undefined]} borderless disabled={loading} onPress={generate}>
          <View style={styles.generateInner}>
            <FontAwesome6 name="wand-magic-sparkles" size={15} color={C.accentTextOn} />
            <Text style={styles.generateText}>{result ? "Generate again" : "Generate"}</Text>
          </View>
        </TouchableRipple>

        <View style={styles.result}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.loadingText}>The AI is building your portfolio…</Text>
            </View>
          ) : result && resultLevel ? (
            <>
              <PortfolioCard
                title="AI"
                titleIcon="wand-magic-sparkles"
                badge={{ label: resultLevel.name, tone: "accent" }}
                slots={result.picks.map((p) => ({ key: p.mint, candidate: byMint.get(p.mint) }))}
              />
              {result.summary ? <Text style={styles.summary}>{result.summary}</Text> : null}
              {result.picks.map((p) => (
                <View key={p.mint} style={styles.reason}>
                  <Text style={styles.reasonSymbol}>{byMint.get(p.mint)?.symbol ?? "?"}</Text>
                  <Text style={styles.reasonText}>{p.reason}</Text>
                </View>
              ))}
            </>
          ) : error ? (
            <EmptyState icon="triangle-exclamation" label="No Roster" hint={error} />
          ) : (
            <View style={styles.emptyBox}>
              <EmptyState icon="wand-magic-sparkles" label="No Roster Yet" hint="Set the risk level and press Generate." />
            </View>
          )}
        </View>
      </ScrollView>

      <BottomBar>
        <TouchableRipple
          style={[styles.use, !result ? styles.useDisabled : undefined]}
          borderless
          disabled={!result || loading}
          onPress={usePortfolio}
        >
          <Text style={[styles.useText, !result ? styles.useTextDisabled : undefined]}>Use portfolio</Text>
        </TouchableRipple>
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  riskHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  riskTitle: { color: C.textPrimary, fontWeight: "800", fontSize: 16 },
  riskName: { color: C.accentText, fontWeight: "800", fontSize: 16 },
  ends: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  endText: { color: C.textSecondary, fontSize: 12 },
  riskDescription: { color: C.textSecondary, fontSize: 13, marginTop: 12 },
  generate: { marginTop: 20, height: 52, borderRadius: 999, backgroundColor: C.accent, justifyContent: "center" },
  generateBusy: { opacity: 0.6 },
  generateInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  generateText: { color: C.accentTextOn, fontWeight: "800", fontSize: 15 },
  result: { marginTop: 24, gap: 10 },
  emptyBox: { minHeight: 200 },
  loading: { minHeight: 200, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: C.textSecondary, fontSize: 13 },
  summary: { color: C.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  reason: { flexDirection: "row", gap: 10 },
  reasonSymbol: { color: C.textPrimary, fontWeight: "800", fontSize: 12, width: 64 },
  reasonText: { color: C.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  use: { height: 52, borderRadius: 999, backgroundColor: C.accent2, justifyContent: "center", alignItems: "center" },
  useDisabled: { backgroundColor: C.glassStrong },
  useText: { color: C.accent2TextOn, fontWeight: "800", fontSize: 15 },
  useTextDisabled: { color: C.textSecondary },
});
