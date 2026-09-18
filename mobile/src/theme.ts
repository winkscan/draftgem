import { MD3DarkTheme } from "react-native-paper";

// Palette lifted from the reference Figma (the Tron-fantasy reskin): a deep
// indigo header/chrome over light content cards, red as the single "money"
// accent (entry price, prize pool, active tab, FAB) — not a generic dark
// crypto-app theme, deliberately closer to a real DFS/sportsbook app.
export const PF_COLORS = {
  header: "#2b2c86",
  headerElevated: "#34358f",
  bg: "#f4f5f9",
  card: "#ffffff",
  cardBorder: "#e7e8f0",
  textPrimary: "#16172b",
  textSecondary: "#6b6e85",
  textOnHeader: "#ffffff",
  textOnHeaderMuted: "rgba(255,255,255,0.72)",
  accent: "#ff4757",
  accentHover: "#ff6b78",
  accentTextOn: "#ffffff",
  positive: "#1fae5c",
  negative: "#ff4757",
  disabled: "#c7c9d6",
};

const c = PF_COLORS;

export const pumpFantasyTheme = {
  ...MD3DarkTheme,
  dark: false,
  colors: {
    ...MD3DarkTheme.colors,
    primary: c.accent,
    onPrimary: c.accentTextOn,
    primaryContainer: "#ffe1e3",
    onPrimaryContainer: c.accent,
    secondary: c.header,
    onSecondary: "#ffffff",
    secondaryContainer: "#e4e4f6",
    onSecondaryContainer: c.header,
    background: c.bg,
    onBackground: c.textPrimary,
    surface: c.card,
    onSurface: c.textPrimary,
    surfaceVariant: "#eef0f7",
    onSurfaceVariant: c.textSecondary,
    outline: c.cardBorder,
    outlineVariant: c.cardBorder,
    error: c.negative,
    onError: "#ffffff",
    elevation: {
      level0: "transparent",
      level1: c.card,
      level2: "#f9f9fc",
      level3: "#f2f3f9",
      level4: "#f2f3f9",
      level5: "#f2f3f9",
    },
  },
};
