import "./src/polyfills";

import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { PaperProvider, adaptNavigationTheme } from "react-native-paper";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { pumpFantasyTheme, PF_COLORS } from "./src/theme";

const queryClient = new QueryClient();

const { DarkTheme: NavTheme } = adaptNavigationTheme({
  reactNavigationDark: NavigationDarkTheme,
});
const combinedNavTheme = {
  ...NavTheme,
  colors: {
    ...NavTheme.colors,
    primary: PF_COLORS.accent,
    card: PF_COLORS.header,
    background: PF_COLORS.bg,
    text: PF_COLORS.textPrimary,
    border: PF_COLORS.cardBorder,
  },
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "confirmed" }}>
          <SafeAreaView style={[styles.shell, { backgroundColor: PF_COLORS.bg }]}>
            <PaperProvider theme={pumpFantasyTheme}>
              <AppNavigator navTheme={combinedNavTheme} />
            </PaperProvider>
          </SafeAreaView>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
});
