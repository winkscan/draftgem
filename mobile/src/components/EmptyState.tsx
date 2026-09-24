import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { PF_COLORS as C } from "../theme";

// The one look for every "nothing here" message in the app: a big muted icon, a short bold title,
// a smaller explanation under it, and optionally an action (children).
export function EmptyState({
  icon,
  label,
  hint,
  children,
}: {
  icon: string;
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <FontAwesome6 name={icon} size={44} color={C.disabled} />
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  label: { color: C.textSecondary, fontWeight: "700", fontSize: 14, textAlign: "center" },
  hint: { color: C.textSecondary, fontSize: 12, textAlign: "center", marginTop: -4 },
});
