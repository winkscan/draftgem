import { ScrollView, StyleSheet } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { PulseBadge } from "./PulseBadge";
import { PF_COLORS as C } from "../theme";

// Shown when entering a tournament didn't go through (payment cancelled in the wallet, or an error),
// the same page as when creating a tournament fails. The drafted portfolio is still there behind it.
export function EntryFailure({
  cancelled,
  message,
  buttonLabel = "Back to tournament",
  onBack,
}: {
  cancelled: boolean;
  message: string;
  buttonLabel?: string;
  onBack: () => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PulseBadge style={styles.badge}>
        <FontAwesome6 name="xmark" size={28} color={C.textPrimary} />
      </PulseBadge>
      <Text style={styles.title}>Couldn't enter the tournament</Text>
      <Text style={styles.hint}>
        {cancelled
          ? "You cancelled the payment in your wallet, so nothing was charged and you didn't enter. Your portfolio is still there."
          : message}
      </Text>
      <TouchableRipple style={styles.whiteButton} borderless onPress={onBack}>
        <Text style={styles.whiteButtonText}>{buttonLabel}</Text>
      </TouchableRipple>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  badge: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.error,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  title: { color: C.textPrimary, fontWeight: "800", fontSize: 22, textAlign: "center", marginTop: 16 },
  hint: { color: C.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12 },
  whiteButton: { marginTop: 32, height: 52, borderRadius: 999, backgroundColor: C.textPrimary, justifyContent: "center", alignItems: "center" },
  whiteButtonText: { color: "#000000", fontWeight: "800", fontSize: 15 },
});
