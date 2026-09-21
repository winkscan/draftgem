import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { TopBar } from "../components/top-bar/TopBar";
import { TournamentFiltersProvider } from "../components/TournamentFiltersContext";
import type { TournamentPhase } from "../pumpfantasy/tournamentPhase";
import { LobbyScreen, LiveScreen, ResultsScreen, GuideScreen } from "../screens";
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
