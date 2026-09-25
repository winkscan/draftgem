import { NavigationContainer, type LinkingOptions, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { HomeNavigator } from "./HomeNavigator";
import { AiPortfolioScreen, CreateTournamentScreen, DraftScreen, LeaderboardScreen, ProfileScreen } from "../screens";
import { DraftHeader } from "../screens/DraftScreen";
import { BackHeader } from "../components/top-bar/BackHeader";
import { ProfileHeader } from "../components/top-bar/ProfileHeader";
import { AiHeader } from "../components/top-bar/AiHeader";
import { PF_COLORS as C } from "../theme";

export type RootStackParamList = {
  HomeStack: undefined;
  Draft: { tournamentId: string };
  CreateTournament: undefined;
  Profile: undefined;
  AiPortfolio: { tournamentId: string };
  Leaderboard: { tournamentId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppStack = () => (
  <Stack.Navigator initialRouteName="HomeStack">
    <Stack.Screen name="HomeStack" component={HomeNavigator} options={{ headerShown: false }} />
    <Stack.Screen
      name="Draft"
      component={DraftScreen}
      options={{
        // The header is the lobby's panel with this tournament's details (DraftHeader).
        header: ({ route }) => <DraftHeader tournamentId={(route.params as { tournamentId: string }).tournamentId} />,
      }}
    />
    <Stack.Screen
      name="CreateTournament"
      component={CreateTournamentScreen}
      options={{
        title: "Create Tournament",
        header: ({ options }) => <BackHeader title={options.title ?? ""} />,
      }}
    />
    <Stack.Screen
      name="AiPortfolio"
      component={AiPortfolioScreen}
      options={{
        title: "AI Portfolio",
        header: ({ options }) => <AiHeader title={options.title ?? ""} />,
      }}
    />
    <Stack.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        title: "My Profile",
        header: ({ options }) => <ProfileHeader title={options.title ?? ""} />,
      }}
    />
    <Stack.Screen
      name="Leaderboard"
      component={LeaderboardScreen}
      options={{
        // The same panel as the tournament's own page (details, badges), without the entry tabs.
        header: ({ route }) => <DraftHeader standings tournamentId={(route.params as { tournamentId: string }).tournamentId} />,
      }}
    />
  </Stack.Navigator>
);

export interface NavigationProps {
  navTheme: Theme;
}

// Shared tournament links (pumpfantasy://t/<id>, opened from the worker's /t/<id>
// page) land on that tournament's Draft screen, with the home tabs underneath so
// Back still goes somewhere.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["pumpfantasy://"],
  config: {
    initialRouteName: "HomeStack",
    screens: { Draft: "t/:tournamentId" },
  },
};

export const AppNavigator = ({ navTheme }: NavigationProps) => {
  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <StatusBar style="light" />
      <AppStack />
    </NavigationContainer>
  );
};
