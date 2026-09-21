import { Dimensions, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { PF_COLORS as C } from "../../theme";

export interface WalletMenuItem {
  key: string;
  label: string;
  /** FontAwesome6 icon name. */
  icon: string;
  onPress: () => void;
}

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Dropdown that drops from the wallet pill, right-aligned under it. Add an
// entry to the `items` list in TopBar to grow it.
export function WalletMenu({
  anchor,
  items,
  onClose,
}: {
  anchor: Anchor | null;
  items: WalletMenuItem[];
  onClose: () => void;
}) {
  const windowWidth = Dimensions.get("window").width;
  return (
    <Modal visible={!!anchor} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        {anchor ? (
          <View style={[styles.menu, { top: anchor.y + anchor.height + 6, right: windowWidth - (anchor.x + anchor.width) }]}>
            {items.map((item) => (
              <TouchableRipple key={item.key} style={styles.item} onPress={item.onPress}>
                <View style={styles.itemInner}>
                  <FontAwesome6 name={item.icon} size={14} color={C.textSecondary} />
                  <Text style={styles.itemText}>{item.label}</Text>
                </View>
              </TouchableRipple>
            ))}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    minWidth: 180,
    backgroundColor: "#26242c",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 6,
    elevation: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  item: { borderRadius: 12 },
  itemInner: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  itemText: { color: C.textPrimary, fontSize: 14, fontWeight: "600" },
});
