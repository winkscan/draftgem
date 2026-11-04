// Desktop layout (web build only): from this window width the phone layout gives way to a sidebar + a centred content column.
// Everything below it (and the whole Android app) keeps the phone layout — useIsDesktop() is simply false there.
import { useSyncExternalStore } from "react";
import { Platform, useWindowDimensions, type ViewStyle } from "react-native";

export const DESKTOP_MIN_WIDTH = 1024;
export const SIDEBAR_WIDTH = 232;
/** The sidebar folded down to its icons (the toggle under the logo). */
export const SIDEBAR_COLLAPSED_WIDTH = 72;
/** The central column's width on desktop; everything inside stretches to it (and shrinks with a narrower window). */
export const CONTENT_MAX_WIDTH = 768;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}

// Whether the sidebar is folded: one value for the whole page, remembered in this browser (a per-viewer convenience,
// so a blocked localStorage just means it starts unfolded).
const COLLAPSED_KEY = "draftgem.sidebarCollapsed";
let collapsed = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

export function setSidebarCollapsed(value: boolean) {
  collapsed = value;
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => collapsed,
  );
}

/** How wide the sidebar is right now: 0 on the phone layout. */
export function useSidebarWidth(): number {
  const desktop = useIsDesktop();
  const folded = useSidebarCollapsed();
  return desktop ? (folded ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0;
}

/**
 * Popups cover the whole browser window (dimmed and blurred), but their box should sit in the middle of the content
 * column, not of the window: the sidebar takes the left of the window, so add its width as left padding to the
 * (centring) backdrop. 0 on the phone layout.
 */
export function useOverlayOffset(): number {
  return useSidebarWidth();
}

/**
 * A page's scroll area reaches past the content column to the window's right edge, so its scrollbar sits there
 * (like a normal web page) and not in the middle of the screen; the padding keeps the content in the column.
 * Add it to the screen's ScrollView / FlatList `style`. undefined on the phone layout.
 */
export function useWindowEdgeScroll(): ViewStyle | undefined {
  const { width } = useWindowDimensions();
  const sidebar = useSidebarWidth();
  if (!sidebar) return undefined;
  const gutter = Math.max(0, Math.floor((width - sidebar - CONTENT_MAX_WIDTH) / 2));
  return gutter ? { marginRight: -gutter, paddingRight: gutter } : undefined;
}

/** Desktop: a screen's pinned bottom strip is just its buttons, without the panel background and top border. */
export const DESKTOP_BAR = { backgroundColor: "transparent", borderTopWidth: 0 } as const;

/** Blurs whatever is behind a popup's backdrop (web only: the native modals keep the plain dim). */
export const OVERLAY_BLUR = (Platform.OS === "web" ? { backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" } : {}) as object;
