import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { TopBar } from "../components/top-bar/TopBar";
import { TournamentFiltersProvider } from "../components/TournamentFiltersContext";
import type { TournamentPhase } from "../pumpfantasy/tournamentPhase";
import { LobbyScreen, LiveScreen, ResultsScreen, GuideScreen } from "../screens";
import { PF_COLORS as C } from "../theme";

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Lobby: "trophy",
  Live: "tower-broadcast",
  Results: "flag-checkered",
  Guide: "book-open",
};

// Which tabs list tournaments (and so show the header's filters).
const PHASES: Record<string, TournamentPhase | undefined> = {
  Lobby: "upcoming",
  Live: "live",
  Results: "results",
};

// Bottom tabs, per the reference mockup minus Staking (explicitly dropped
// for v1) — Lobby / Live / Results, plus the Guide knowledge base.
export function HomeNavigator() {
  return (
    <TournamentFiltersProvider>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          header: () => <TopBar phase={PHASES[route.name]} />,
          // Same panel colour as the header, rounded on the top corners, no border;
          // the active item has a purple icon and a white label.
          tabBarStyle: {
            backgroundColor: C.headerPanel,
            borderTopWidth: 0,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            height: 64,
            paddingTop: 8,
            paddingBottom: 8,
            elevation: 16,
            shadowColor: "#000000",
            shadowOpacity: 0.5,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -6 },
          },
          tabBarIcon: ({ focused, size }) => (
            <FontAwesome6
              name={ICONS[route.name] ?? "circle"}
              size={size * 0.8}
              color={focused ? C.accent : C.textSecondary}
            />
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={{ fontSize: 11, fontWeight: "600", color: focused ? C.textPrimary : C.textSecondary }}>
              {route.name}
            </Text>
          ),
        })}
      >
        <Tab.Screen name="Lobby" component={LobbyScreen} />
        <Tab.Screen name="Live" component={LiveScreen} />
        <Tab.Screen name="Results" component={ResultsScreen} />
        <Tab.Screen name="Guide" component={GuideScreen} />
      </Tab.Navigator>
    </TournamentFiltersProvider>
  );
}
