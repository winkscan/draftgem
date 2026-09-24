import { NavigationContainer, type LinkingOptions, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { HomeNavigator } from "./HomeNavigator";
import { CreateTournamentScreen, DraftScreen, LeaderboardScreen } from "../screens";
import { DraftHeader } from "../screens/DraftScreen";
import { BackHeader } from "../components/top-bar/BackHeader";
import { PF_COLORS as C } from "../theme";

export type RootStackParamList = {
  HomeStack: undefined;
  Draft: { tournamentId: string };
  CreateTournament: undefined;
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
      name="Leaderboard"
      component={LeaderboardScreen}
      options={{
        title: "Standings", // replaced with "Live Standings" / "Final Standings" once the phase is known
        header: ({ options }) => <BackHeader title={options.title ?? ""} />,
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
