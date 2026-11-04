import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PF_COLORS as C } from "../theme";
import { useIsDesktop } from "./desktop";

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
  const desktop = useIsDesktop();
  const [homeFocused, setHomeFocused] = useState(false);
  const [panelHeader, setPanelHeader] = useState(false);
  const value = useMemo(() => ({ homeFocused, setHomeFocused, setPanelHeader }), [homeFocused]);
  const band = homeFocused || panelHeader ? C.headerPanel : C.header;
  return (
    <ChromeContext.Provider value={value}>
      <View style={styles.shell}>
        {/* Web: the app is laid out for a phone, so on a wide window it stays a centred phone-width column. */}
        <View style={[styles.column, desktop ? styles.columnDesktop : undefined]}>
          <View style={{ height: insets.top, backgroundColor: band }} />
          <View style={styles.content}>{children}</View>
          <View style={{ height: insets.bottom, backgroundColor: homeFocused ? C.headerPanel : C.bg }} />
        </View>
      </View>
    </ChromeContext.Provider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.bg, alignItems: "center" },
  column: Platform.OS === "web"
    ? { flex: 1, width: "100%", maxWidth: 480, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.cardBorder }
    : { flex: 1, width: "100%" },
  // Wide window: the desktop frame (navigators/DesktopFrame.tsx) lays the screen out itself.
  columnDesktop: { maxWidth: 100000, borderLeftWidth: 0, borderRightWidth: 0 },
  content: { flex: 1 },
});
