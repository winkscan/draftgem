import { MD3DarkTheme } from "react-native-paper";

// Night theme in Solana's own colours (studied from solana.com + the brand
// art, 2026-09-21): true black canvas with near-black violet-tinted surfaces,
// hairline lavender borders, white type with a soft grey for secondary text.
//
// Two accents — Solana purple and Solana green. Red (#f11212, 2026-09-22) marks both
// errors and losses — an explicit reversal of the original "red is errors only, losses
// are magenta" rule from 2026-09-21.
export const PF_COLORS = {
  // canvas + surfaces
  bg: "#000000",
  card: "#0D0C11",
  cardBorder: "rgba(236,228,253,0.12)",
  glass: "rgba(236,228,253,0.08)", // translucent lavender wash, like solana.com's panels
  glassStrong: "rgba(236,228,253,0.16)",

  // top bar / navigation chrome
  header: "#000000",
  headerElevated: "#16141D",
  // Tab-screen header panel: the card-border lavender (0.12) flattened onto the
  // black canvas, so the panel reads as raised above the page without a shadow.
  headerPanel: "#1c1b1e",
  textOnHeader: "#ffffff",
  textOnHeaderMuted: "rgba(255,255,255,0.7)",

  // type
  textPrimary: "#ffffff",
  textSecondary: "#ababba",
  disabled: "rgba(255,255,255,0.28)",

  // accent 1 — Solana purple: primary actions, active states
  accent: "#9945ff",
  accentHover: "#b278ff",
  accentText: "#b98cff", // the same purple, lightened for small text on black
  accentTextOn: "#ffffff",
  accentTint: "rgba(153,69,255,0.18)",

  // accent 2 — Solana green: gains, links, guarantees
  accent2: "#14f195",
  accent2TextOn: "#04140d",
  accent2Tint: "rgba(20,241,149,0.12)",

  // Single-entry mode badge — a third, cooler accent so it reads apart from
  // Multiple (purple) and Guaranteed (green) at a glance.
  modeSingle: "#c1f112",
  modeSingleTextOn: "#1a2200",

  // Payout-structure badge (Top 1/Top 3/30%/50%/PvP). Deliberately NOT accent2 — that
  // mint green is bright enough to read as washed-out white on a small pill.
  payoutBadge: "#0d9488",
  payoutBadgeTextOn: "#ffffff",

  // outcomes
  positive: "#14f195",
  negative: "#f11212", // losses, same red as errors

  error: "#f11212",
  errorTint: "rgba(241,18,18,0.12)",
};

const c = PF_COLORS;

export const pumpFantasyTheme = {
  ...MD3DarkTheme,
  dark: true,
  colors: {
    ...MD3DarkTheme.colors,
    primary: c.accent,
    onPrimary: c.accentTextOn,
    primaryContainer: c.accentTint,
    onPrimaryContainer: c.accentText,
    secondary: c.accent2,
    onSecondary: c.accent2TextOn,
    secondaryContainer: c.accent2Tint,
    onSecondaryContainer: c.accent2,
    background: c.bg,
    onBackground: c.textPrimary,
    surface: c.card,
    onSurface: c.textPrimary,
    surfaceVariant: c.headerElevated,
    onSurfaceVariant: c.textSecondary,
    outline: c.cardBorder,
    outlineVariant: c.cardBorder,
    error: c.error,
    onError: "#ffffff",
    elevation: {
      level0: "transparent",
      level1: c.card,
      level2: "#12101a",
      level3: c.headerElevated,
      level4: "#1b1824",
      level5: "#1f1c2a",
    },
  },
};
