import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { PF_COLORS as C } from "../theme";

const ICONS: Record<string, string> = {
  Lobby: "trophy",
  Live: "tower-broadcast",
  Results: "flag-checkered",
  Guide: "book-open",
};

const FAB_SIZE = 56;
const FAB_OVERHANG = 24; // how far the "+" button rises above the bar

// Custom bottom bar: panel-coloured with rounded top corners, the tabs grouped
// two-and-two around a raised green "+" that opens the create-tournament screen.
export function HomeTabBar({ state, navigation }: BottomTabBarProps) {
  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const focused = state.index === index;
    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={onPress}
        android_ripple={{ color: C.glass, borderless: true }}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={route.name}
      >
        <FontAwesome6 name={ICONS[route.name] ?? "circle"} size={17} color={focused ? C.accent : C.textSecondary} />
        <Text style={[styles.label, { color: focused ? C.textPrimary : C.textSecondary }]}>{route.name}</Text>
      </Pressable>
    );
  };

  const half = Math.ceil(state.routes.length / 2);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.group}>{state.routes.slice(0, half).map((r, i) => renderTab(r, i))}</View>
        <View style={styles.gap} />
        <View style={styles.group}>{state.routes.slice(half).map((r, i) => renderTab(r, i + half))}</View>
      </View>
      {/* A direct sibling of the bar (not nested in a wrapper): on Android two siblings are stacked by
          elevation, and only then is the higher one (24 vs the bar's 16) guaranteed to be drawn on top. */}
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate("CreateTournament" as never)}
        android_ripple={{ color: "rgba(0,0,0,0.15)", borderless: true }}
        accessibilityRole="button"
        accessibilityLabel="Create a tournament"
      >
        <FontAwesome6 name="plus" size={22} color={C.accent2TextOn} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // The strip above the bar is transparent: it holds the top of the "+" so all of the
  // button sits inside this view's bounds (Android only delivers touches inside them).
  wrap: { paddingTop: FAB_OVERHANG },
  // Height comes from the content: the same 12px above the icons and below the labels.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: C.headerPanel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
  },
  group: { flex: 1, flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", gap: 4 },
  // Fixed line height without Android's extra font padding, so the bottom gap really is 12.
  label: { fontSize: 11, lineHeight: 14, fontWeight: "600", includeFontPadding: false },
  gap: { width: FAB_SIZE + 32 }, // room for the "+" so no tab crowds it
  fab: {
    position: "absolute",
    top: 0,
    left: "50%",
    marginLeft: -FAB_SIZE / 2,
    zIndex: 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: C.accent2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
