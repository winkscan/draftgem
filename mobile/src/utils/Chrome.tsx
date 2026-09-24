import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PF_COLORS as C } from "../theme";

// The app's outer shell. It leaves the system bars' safe areas (status bar on top,
// gesture/navigation bar at the bottom) free of content, and paints them: on the home
// tabs they take the header's and the tab bar's colour so the chrome looks continuous;
// everywhere else they stay black like the stack screens' own headers.
interface ChromeState {
  /** True while the home tabs (header + tab bar) are the visible screen. */
  homeFocused: boolean;
  setHomeFocused: (focused: boolean) => void;
  /** A stack screen that draws the panel-coloured header (a tournament's page) tints just the status-bar strip. */
  setPanelHeader: (on: boolean) => void;
}

const ChromeContext = createContext<ChromeState>({ homeFocused: false, setHomeFocused: () => {}, setPanelHeader: () => {} });

export function useChrome(): ChromeState {
  return useContext(ChromeContext);
}

export function Shell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [homeFocused, setHomeFocused] = useState(false);
  const [panelHeader, setPanelHeader] = useState(false);
  const value = useMemo(() => ({ homeFocused, setHomeFocused, setPanelHeader }), [homeFocused]);
  const band = homeFocused || panelHeader ? C.headerPanel : C.header;
  return (
    <ChromeContext.Provider value={value}>
      <View style={styles.shell}>
        <View style={{ height: insets.top, backgroundColor: band }} />
        <View style={styles.content}>{children}</View>
        <View style={{ height: insets.bottom, backgroundColor: homeFocused ? C.headerPanel : C.bg }} />
      </View>
    </ChromeContext.Provider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
});
