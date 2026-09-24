import { StyleSheet, View } from "react-native";
import { PF_COLORS as C } from "../theme";

// The strip pinned to the bottom of a screen that holds its main buttons: same as the draft page's
// Enter footer, so every result / form screen ends the same way.
export function BottomBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: { padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: C.cardBorder, backgroundColor: C.card },
});
