import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { useTournamentFilters } from "../TournamentFiltersContext";
import { SelectPill } from "./SelectPill";
import {
  ENTRY_OPTIONS,
  PAYOUT_CHIPS,
  SCOPE_TABS,
  sortOptions,
} from "../../pumpfantasy/tournamentFilters";
import type { TournamentPhase } from "../../pumpfantasy/tournamentPhase";
import { PF_COLORS as C } from "../../theme";

// Layers 1 and 2 of the tournament filters — they sit inside the header panel,
// under the wallet row: All / My Tournaments, then the payout-structure chips.
export function TournamentFilterTabs() {
  const { filters, setFilter } = useTournamentFilters();
  return (
    <View>
      <View style={styles.divider} />
      <View style={styles.tabs}>
        {SCOPE_TABS.map((t) => {
          const active = filters.scope === t.key;
          return (
            <TouchableRipple key={t.key} style={styles.tab} onPress={() => setFilter("scope", t.key)}>
              <View style={styles.tabInner}>
                <Text style={[styles.tabText, active ? styles.tabTextActive : undefined]}>{t.label}</Text>
                <View style={[styles.underline, active ? styles.underlineActive : undefined]} />
              </View>
            </TouchableRipple>
          );
        })}
      </View>
      <View style={styles.chips}>
        {PAYOUT_CHIPS.map((c) => {
          const active = filters.payout === c.key;
          return (
            <TouchableRipple
              key={c.key}
              borderless
              style={[styles.chip, active ? styles.chipActive : undefined]}
              onPress={() => setFilter("payout", c.key)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : undefined]} numberOfLines={1}>
                {c.label}
              </Text>
            </TouchableRipple>
          );
        })}
      </View>
    </View>
  );
}

// Layer 3: two selects side by side, on the page background below the panel.
export function TournamentFilterSelects({ phase }: { phase: TournamentPhase }) {
  const { filters, setFilter } = useTournamentFilters();
  return (
    <View style={styles.selects}>
      <SelectPill title="SORT BY" value={filters.sort} options={sortOptions(phase)} onChange={(k) => setFilter("sort", k)} />
      <SelectPill title="ENTRY" value={filters.entry} options={ENTRY_OPTIONS} onChange={(k) => setFilter("entry", k)} />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, backgroundColor: C.cardBorder },
  // Same 16px side margins as the wallet row; each tab stretches to half the width.
  tabs: { flexDirection: "row", paddingHorizontal: 16 },
  tab: { flex: 1 },
  tabInner: { alignItems: "center", paddingTop: 12 },
  tabText: { color: C.textSecondary, fontSize: 14, fontWeight: "600", paddingBottom: 12 },
  tabTextActive: { color: C.textPrimary, fontWeight: "800" },
  underline: { height: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: "transparent" },
  underlineActive: { backgroundColor: C.accent },
  chips: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    flex: 1,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.textPrimary, fontSize: 12.5, fontWeight: "600" },
  chipTextActive: { color: C.accentTextOn, fontWeight: "800" },
  selects: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 16, backgroundColor: C.bg },
});
