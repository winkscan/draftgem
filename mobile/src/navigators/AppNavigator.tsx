import { NavigationContainer, type LinkingOptions, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { HomeNavigator } from "./HomeNavigator";
import { CreateTournamentScreen, DraftScreen, LeaderboardScreen } from "../screens";
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
        title: "Build Your Portfolio",
        headerStyle: { backgroundColor: C.header },
        headerTintColor: C.textOnHeader,
      }}
    />
    <Stack.Screen
      name="CreateTournament"
      component={CreateTournamentScreen}
      options={{
        title: "Create Tournament",
        headerStyle: { backgroundColor: C.header },
        headerTintColor: C.textOnHeader,
      }}
    />
    <Stack.Screen
      name="Leaderboard"
      component={LeaderboardScreen}
      options={{
        title: "Standings", // replaced with "Live Standings" / "Final Standings" once the phase is known
        headerStyle: { backgroundColor: C.header },
        headerTintColor: C.textOnHeader,
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
