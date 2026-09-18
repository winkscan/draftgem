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
        <Text style={styles.letter}>{tournament.entryMode === "multiple" ? "M" : "S"}</Text>
      </View>
      {tournament.guaranteedAmountLamports > 0n ? (
        <View style={[styles.circle, styles.guaranteed]}>
          <Text style={styles.letter}>G</Text>
        </View>
      ) : null}
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
  single: { backgroundColor: C.header },
  multiple: { backgroundColor: C.accent },
  guaranteed: { backgroundColor: C.positive },
  letter: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
