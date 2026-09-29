import "./src/polyfills";

import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { PaperProvider, adaptNavigationTheme } from "react-native-paper";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { Shell } from "./src/utils/Chrome";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { AnimatedSplash } from "./src/components/AnimatedSplash";
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

// React Query only knows the app came back to the foreground if something tells it — on web it listens to
// the browser tab itself, but React Native has no such thing, so without this every screen just sits on
// whatever it last had (or never resolved) until its own poll interval happens to fire next, which can be a
// long wait after the app spent real time backgrounded. This makes coming back from the background behave
// like React Query expects a foreground return to behave: refetch what's stale, right away.
function useReactQueryAppStateFocus() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);
}

export default function App() {
  useReactQueryAppStateFocus();
  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "confirmed" }}>
          <SafeAreaProvider>
            <Shell>
              <AnimatedSplash>
                <PaperProvider theme={pumpFantasyTheme}>
                  <AppNavigator navTheme={combinedNavTheme} />
                </PaperProvider>
              </AnimatedSplash>
            </Shell>
          </SafeAreaProvider>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}
