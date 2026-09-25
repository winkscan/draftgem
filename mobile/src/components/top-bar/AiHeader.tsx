import { StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { useAiAllowance, useCountdown } from "../../pumpfantasy/aiLimit";
import { BackHeader } from "./BackHeader";
import { PF_COLORS as C } from "../../theme";

// The AI page's header: the standard back arrow and title, and on the right how many free generations
// are left today (or, once they are gone, when they come back).
export function AiHeader({ title }: { title: string }) {
  const a = useAiAllowance();
  const countdown = useCountdown(a && a.left === 0 ? a.resetAt : null);
  const text = !a ? null : a.left > 0 ? a.left + " free generation" + (a.left === 1 ? "" : "s") + " left" : "Reset in " + countdown;
  return <BackHeader title={title} right={text ? <Text style={styles.right}>{text}</Text> : null} />;
}

const styles = StyleSheet.create({
  right: { color: C.textOnHeaderMuted, fontSize: 12, fontWeight: "700" },
});
