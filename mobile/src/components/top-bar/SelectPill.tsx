import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { PF_COLORS as C } from "../../theme";

// A pill that shows the current choice and opens a bottom sheet with the
// options — same look as the reference mockup's select, dark-themed.
export function SelectPill<K extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: K;
  options: { key: K; label: string }[];
  onChange: (key: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value) ?? options[0];

  return (
    <>
      <TouchableRipple style={styles.pill} borderless onPress={() => setOpen(true)}>
        <View style={styles.pillInner}>
          <Text style={styles.pillText} numberOfLines={1}>
            {current.label}
          </Text>
          <FontAwesome6 name="chevron-down" size={11} color={C.textSecondary} />
        </View>
      </TouchableRipple>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{title}</Text>
            {options.map((o) => {
              const selected = o.key === value;
              return (
                <TouchableRipple
                  key={o.key}
                  style={[styles.option, selected ? styles.optionSelected : undefined]}
                  onPress={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                >
                  <View style={styles.optionInner}>
                    <Text style={[styles.optionText, selected ? styles.optionTextSelected : undefined]}>{o.label}</Text>
                    {selected ? <FontAwesome6 name="check" size={13} color={C.accent2} /> : null}
                  </View>
                </TouchableRipple>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  pillInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 8,
  },
  pillText: { color: C.textPrimary, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.cardBorder,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 28,
  },
  sheetTitle: { color: C.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 8, marginLeft: 8, letterSpacing: 0.6 },
  option: { borderRadius: 14 },
  optionSelected: { backgroundColor: C.accentTint },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  optionText: { color: C.textPrimary, fontSize: 15 },
  optionTextSelected: { fontWeight: "700" },
});
