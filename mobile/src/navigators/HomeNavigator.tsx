import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { TopBar } from "../components/top-bar/TopBar";
import { LobbyScreen, LiveScreen, ResultsScreen, GuideScreen } from "../screens";
import { PF_COLORS as C } from "../theme";

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Lobby: "trophy",
  Live: "tower-broadcast",
  Results: "flag-checkered",
  Guide: "book-open",
};

// Bottom tabs, per the reference mockup minus Staking (explicitly dropped
// for v1) — Lobby / Live / Results, plus the Guide knowledge base.
export function HomeNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <TopBar />,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textSecondary,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.cardBorder,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarIcon: ({ color, size }) => (
          <FontAwesome6 name={ICONS[route.name] ?? "circle"} size={size * 0.8} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Lobby" component={LobbyScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
      <Tab.Screen name="Results" component={ResultsScreen} />
      <Tab.Screen name="Guide" component={GuideScreen} />
    </Tab.Navigator>
  );
}
