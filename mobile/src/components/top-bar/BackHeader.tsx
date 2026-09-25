import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useChrome } from "../../utils/Chrome";
import { PF_COLORS as C } from "../../theme";

// The header of the simple stack screens (Create Tournament, Standings): the same panel as the lobby's
// and a tournament's, with the usual back arrow and a title.
export function BackHeader({ title, right }: { title: string; /** Something on the title's line, at the right edge. */ right?: React.ReactNode }) {
  const navigation = useNavigation();
  const { setPanelHeader } = useChrome();
  useEffect(() => {
    setPanelHeader(true);
    return () => setPanelHeader(false);
  }, [setPanelHeader]);
  return (
    <View style={styles.panel}>
      <View style={styles.bar}>
        <TouchableRipple style={styles.back} borderless onPress={() => navigation.goBack()}>
          <FontAwesome6 name="chevron-left" size={16} color={C.textOnHeader} />
        </TouchableRipple>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.headerPanel, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  back: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  title: { color: C.textOnHeader, fontWeight: "800", fontSize: 18, flex: 1 },
});
