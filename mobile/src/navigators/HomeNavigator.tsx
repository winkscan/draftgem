import { useCallback } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { TopBar } from "../components/top-bar/TopBar";
import { TournamentFiltersProvider } from "../components/TournamentFiltersContext";
import type { TournamentPhase } from "../pumpfantasy/tournamentPhase";
import { LobbyScreen, LiveScreen, ResultsScreen, GuideScreen } from "../screens";
import { useChrome } from "../utils/Chrome";
import { HomeTabBar } from "./HomeTabBar";

const Tab = createBottomTabNavigator();

// Which tabs list tournaments (and so show the header's filters).
const PHASES: Record<string, TournamentPhase | undefined> = {
  Lobby: "upcoming",
  Live: "live",
  Results: "results",
};

// Bottom tabs, per the reference mockup minus Staking (explicitly dropped
// for v1) — Lobby / Live / Results, plus the Guide knowledge base. The bar
// itself (with the "+" create button) is HomeTabBar.
export function HomeNavigator() {
  // While the tabs are on screen, the status-bar and gesture-bar strips take the header's / tab bar's
  // colour and the "+" is shown (see utils/Chrome.tsx).
  const { setHomeFocused } = useChrome();
  useFocusEffect(
    useCallback(() => {
      setHomeFocused(true);
      return () => setHomeFocused(false);
    }, [setHomeFocused]),
  );

  return (
    <TournamentFiltersProvider>
      <Tab.Navigator
        tabBar={(props) => <HomeTabBar {...props} />}
        screenOptions={({ route }) => ({
          header: () => <TopBar phase={PHASES[route.name]} />,
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
