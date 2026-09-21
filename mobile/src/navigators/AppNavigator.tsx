import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { HomeNavigator } from "./HomeNavigator";
import { DraftScreen, LeaderboardScreen } from "../screens";
import { PF_COLORS as C } from "../theme";

export type RootStackParamList = {
  HomeStack: undefined;
  Draft: { tournamentId: string };
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

export const AppNavigator = ({ navTheme }: NavigationProps) => {
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <AppStack />
    </NavigationContainer>
  );
};
