import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import type { TournamentAccount } from "../pumpfantasy/accounts";
import { PF_COLORS as C } from "../theme";

// S = Single entry per wallet, M = Multiple entries allowed, G = Guaranteed
// prize pool (house-funded floor, independent of entry mode — stacks as a
// second badge, not a third mode).
export function ModeBadges({ tournament }: { tournament: Pick<TournamentAccount, "entryMode" | "guaranteedAmountLamports"> }) {
  return (
    <View style={styles.row}>
      <View style={[styles.circle, tournament.entryMode === "multiple" ? styles.multiple : styles.single]}>
        <Text style={[styles.letter, tournament.entryMode === "multiple" ? undefined : styles.letterOnSingle]}>
          {tournament.entryMode === "multiple" ? "M" : "S"}
        </Text>
      </View>
      {tournament.guaranteedAmountLamports > 0n ? (
        <View style={[styles.circle, styles.guaranteed]}>
          <Text style={[styles.letter, styles.letterOnGreen]}>G</Text>
        </View>
      ) : null}
    </View>
  );
}

// The prize-structure pill (Top 1 / Top 3 / 30% / 50% / PvP) that sits next to the
// mode badges on a tournament card — a solid teal, distinct from every other badge.
export function PayoutBadge({ label }: { label: string }) {
  return (
    <View style={styles.payoutPill}>
      <Text style={styles.payoutText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  single: { backgroundColor: C.modeSingle },
  multiple: { backgroundColor: C.accent },
  guaranteed: { backgroundColor: C.accent2 },
  letter: { color: C.textPrimary, fontSize: 10, fontWeight: "800" },
  letterOnGreen: { color: C.accent2TextOn },
  letterOnSingle: { color: C.modeSingleTextOn },
  payoutPill: { height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: C.payoutBadge, justifyContent: "center" },
  payoutText: { color: C.payoutBadgeTextOn, fontSize: 10, fontWeight: "800" },
});
