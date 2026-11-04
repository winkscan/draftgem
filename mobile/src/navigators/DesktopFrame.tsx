import { useEffect, useState, type ReactNode } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { PLAYER_TOURNAMENTS } from "../pumpfantasy/config";
import { CURRENCIES, formatAmountCompact } from "../pumpfantasy/currency";
import { ellipsify } from "../pumpfantasy/format";
import { useSkrBalance } from "../pumpfantasy/tokenBalance";
import { CurrencyIcon } from "../components/CurrencyIcon";
import { DraftGemMark, DraftGemWordmark } from "../components/brand/DraftGemLogo";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { CONTENT_MAX_WIDTH, setSidebarCollapsed, useSidebarCollapsed, useSidebarWidth } from "../utils/desktop";
import { TAB_ICONS } from "./HomeTabBar";
import type { RootStackParamList } from "./AppNavigator";
import { PF_COLORS as C } from "../theme";

type NavRef = NavigationContainerRefWithCurrent<RootStackParamList>;

const TABS = ["Lobby", "Live", "Results", "Guide"] as const;

/** Where the app is right now: the top screen of the stack, and which home tab is open under it. */
function useRootRoute(navRef: NavRef) {
  const read = () => {
    const state = navRef.isReady() ? navRef.getRootState() : undefined;
    const top = state?.routes[state.index];
    const nested = top?.state as { index?: number; routes: { name: string }[] } | undefined;
    const tab = top?.name === "HomeStack" ? (nested?.routes[nested.index ?? 0]?.name ?? "Lobby") : null;
    return { screen: top?.name ?? "HomeStack", tab };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => setRoute(read());
    update();
    return navRef.addListener("state", update);
  }, [navRef]);
  return route;
}

// The desktop shell: a sidebar that replaces the phone's bottom tab bar (and the wallet pill of the top bar),
// and the screens in a centred column next to it. Rendered around the whole stack, so it stays put while
// tournament pages open and close.
export function DesktopFrame({ navRef, children }: { navRef: NavRef; children: ReactNode }) {
  const { screen, tab } = useRootRoute(navRef);
  return (
    <View style={styles.frame}>
      <Sidebar navRef={navRef} screen={screen} tab={tab} />
      <View style={styles.main}>
        <View style={styles.column}>{children}</View>
      </View>
    </View>
  );
}

// Folding animates the width; the labels fade and narrow to nothing while every icon keeps its place (each one sits
// where it is centred in the folded 72px bar), so nothing jumps.
const SMOOTH = (Platform.OS === "web"
  ? { transitionProperty: "width, max-width, opacity, margin-left", transitionDuration: "220ms", transitionTimingFunction: "ease" }
  : {}) as object;

/** A label that disappears when the sidebar folds. */
function fade(folded: boolean, marginLeft: number) {
  return [styles.label, SMOOTH, folded ? { opacity: 0, maxWidth: 0, marginLeft: 0 } : { opacity: 1, maxWidth: 180, marginLeft }];
}

// Folded (the toggle above the wallet, remembered in the browser) it keeps only the icons: the gem, the tabs,
// a round "+" and the wallet's logo.
function Sidebar({ navRef, screen, tab }: { navRef: NavRef; screen: string; tab: string | null }) {
  const { selectedAccount } = useAuthorization();
  const { connect } = useMobileWallet();
  const { data: skrBalance } = useSkrBalance(selectedAccount?.publicKey ?? null);
  const folded = useSidebarCollapsed();
  const width = useSidebarWidth();

  return (
    <View style={[styles.sidebar, SMOOTH, { width }]}>
      <View style={styles.brand}>
        <DraftGemMark height={30} />
        <View style={[styles.brandRest, ...fade(folded, 10)]}>
          <DraftGemWordmark height={30} />
          <View style={styles.beta}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
        </View>
      </View>

      <View style={styles.nav}>
        {TABS.map((name) => {
          const active = tab === name;
          return (
            <TouchableRipple
              key={name}
              style={[styles.navItem, active ? styles.navItemActive : undefined]}
              borderless
              onPress={() => navRef.navigate("HomeStack", { screen: name } as never)}
              accessibilityRole="button"
              accessibilityLabel={name}
            >
              <View style={styles.navInner}>
                <FontAwesome6 name={TAB_ICONS[name]} size={16} color={active ? C.accent : C.textSecondary} style={styles.navIcon} />
                <Text numberOfLines={1} style={[styles.navText, active ? styles.navTextActive : undefined, ...fade(folded, 12)]}>
                  {name}
                </Text>
              </View>
            </TouchableRipple>
          );
        })}
      </View>

      {PLAYER_TOURNAMENTS ? (
        <TouchableRipple
          style={[styles.create, screen === "CreateTournament" ? styles.createActive : undefined]}
          borderless
          onPress={() => navRef.navigate("CreateTournament")}
          accessibilityRole="button"
          accessibilityLabel="Create a tournament"
        >
          <View style={styles.createInner}>
            <FontAwesome6 name="plus" size={14} color={C.accent2TextOn} />
            <Text numberOfLines={1} style={[styles.createText, ...fade(folded, 8)]}>
              Create tournament
            </Text>
          </View>
        </TouchableRipple>
      ) : null}

      <View style={styles.spacer} />

      <TouchableRipple
        style={styles.navItem}
        borderless
        onPress={() => setSidebarCollapsed(!folded)}
        accessibilityRole="button"
        accessibilityLabel={folded ? "Expand the menu" : "Collapse the menu"}
      >
        <View style={styles.navInner}>
          <FontAwesome6 name={folded ? "angles-right" : "angles-left"} size={14} color={C.textSecondary} style={styles.navIcon} />
          <Text numberOfLines={1} style={[styles.navText, ...fade(folded, 12)]}>
            Collapse
          </Text>
        </View>
      </TouchableRipple>

      <TouchableRipple
        style={[styles.wallet, screen === "Profile" ? styles.walletActive : undefined]}
        borderless
        onPress={selectedAccount ? () => navRef.navigate("Profile") : () => connect().catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel={selectedAccount ? "My profile" : "Connect wallet"}
      >
        {selectedAccount ? (
          <View style={styles.walletInner}>
            <View style={styles.walletCircle}>
              {selectedAccount.icon ? (
                <Image source={{ uri: selectedAccount.icon }} style={styles.walletImage} />
              ) : (
                <FontAwesome6 name="wallet" size={14} color={C.textOnHeader} />
              )}
            </View>
            <View style={[styles.walletText, ...fade(folded, 10)]}>
              <Text numberOfLines={1} style={styles.walletAddress}>
                {ellipsify(selectedAccount.publicKey, 4)}
              </Text>
              <View style={styles.balanceRow}>
                <CurrencyIcon currency="SKR" size={14} />
                <Text numberOfLines={1} style={styles.balance}>
                  {formatAmountCompact(skrBalance ?? 0n, CURRENCIES.SKR.decimals)}
                </Text>
              </View>
            </View>
            <FontAwesome6 name="chevron-right" size={11} color={C.textSecondary} style={[SMOOTH, { opacity: folded ? 0 : 1 }]} />
          </View>
        ) : (
          <View style={[styles.walletInner, styles.connectInner]}>
            <FontAwesome6 name="wallet" size={15} color={C.textOnHeader} />
            <Text numberOfLines={1} style={[styles.connectText, ...fade(folded, 10)]}>
              Connect wallet
            </Text>
          </View>
        )}
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, flexDirection: "row", backgroundColor: C.bg },
  main: { flex: 1, alignItems: "center", backgroundColor: C.bg },
  column: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH },
  // 12px padding on both widths: the folded bar's 48px inner width is what the icons are centred in.
  sidebar: {
    padding: 12,
    paddingTop: 16,
    gap: 6,
    overflow: "hidden",
    backgroundColor: C.card,
    borderRightWidth: 1,
    borderRightColor: C.cardBorder,
  },
  label: { overflow: "hidden" },
  brand: { flexDirection: "row", alignItems: "center", paddingLeft: 9, paddingTop: 4, paddingBottom: 20 },
  brandRest: { flexDirection: "row", alignItems: "center", gap: 12 },
  beta: { borderRadius: 999, backgroundColor: C.glassStrong, paddingHorizontal: 8, paddingVertical: 3 },
  betaText: { color: C.textOnHeaderMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  nav: { gap: 4 },
  navItem: { borderRadius: 12 },
  navItemActive: { backgroundColor: C.glassStrong },
  navInner: { flexDirection: "row", alignItems: "center", paddingLeft: 14, height: 44 },
  navIcon: { width: 20, textAlign: "center" },
  navText: { color: C.textSecondary, fontWeight: "600", fontSize: 14 },
  navTextActive: { color: C.textPrimary, fontWeight: "800" },
  create: { height: 44, borderRadius: 999, backgroundColor: C.accent2, justifyContent: "center", marginTop: 16 },
  createActive: { backgroundColor: C.accent2, opacity: 0.8 },
  createInner: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  createText: { color: C.accent2TextOn, fontWeight: "800", fontSize: 14 },
  spacer: { flex: 1 },
  wallet: { borderRadius: 16, backgroundColor: C.glass, borderWidth: 1, borderColor: C.cardBorder },
  walletActive: { borderColor: C.accent },
  // 7px on the left centres the 32px wallet logo in the folded bar's 46px (48 minus the border).
  walletInner: { flexDirection: "row", alignItems: "center", paddingLeft: 7, paddingRight: 12, paddingVertical: 12, minHeight: 56 },
  connectInner: { paddingLeft: 15 },
  walletCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  walletImage: { width: 32, height: 32 },
  walletText: { flex: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  walletAddress: { color: C.textPrimary, fontWeight: "700", fontSize: 13 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  balance: { color: C.textSecondary, fontWeight: "700", fontSize: 12 },
  connectText: { color: C.textPrimary, fontWeight: "700", fontSize: 14 },
});
