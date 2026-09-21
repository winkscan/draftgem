import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { GUIDE_TOPICS } from "../guide/topics";
import { PF_COLORS as C } from "../theme";

// A knowledge base as an accordion: one collapsible item per topic in
// guide/topics.tsx. Several can be open at once; the first starts open.
export function GuideScreen() {
  const [open, setOpen] = useState<Set<string>>(() => new Set(GUIDE_TOPICS.slice(0, 1).map((t) => t.id)));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>How things work — tap a topic to open it.</Text>
      {GUIDE_TOPICS.map((topic) => {
        const isOpen = open.has(topic.id);
        return (
          <View key={topic.id} style={styles.item}>
            <TouchableRipple onPress={() => toggle(topic.id)} style={styles.header}>
              <View style={styles.headerInner}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconWrap}>
                    <FontAwesome6 name={topic.icon} size={13} color={C.header} />
                  </View>
                  <Text style={styles.title}>{topic.title}</Text>
                </View>
                <FontAwesome6 name={isOpen ? "chevron-up" : "chevron-down"} size={12} color={C.textSecondary} />
              </View>
            </TouchableRipple>
            {isOpen ? <View style={styles.body}>{topic.body}</View> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  intro: { color: C.textSecondary, fontSize: 12, marginBottom: 2 },
  item: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
  },
  header: { paddingHorizontal: 14, paddingVertical: 14 },
  headerInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e4e4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: C.textPrimary, fontWeight: "700", fontSize: 15 },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
});
