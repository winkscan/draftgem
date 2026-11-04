import { StyleSheet } from "react-native";
import { TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { PF_COLORS as C } from "../theme";

// The cross in a popup's top-right corner (desktop popups close with it instead of a back arrow).
export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableRipple style={styles.button} borderless onPress={onPress} accessibilityRole="button" accessibilityLabel="Close">
      <FontAwesome6 name="xmark" size={16} color={C.textPrimary} />
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: -6 },
});
