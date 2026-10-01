import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useMyStats } from "../pumpfantasy/profileStats";
import { PnlCard } from "../components/PnlCard";
import { BottomBar } from "../components/BottomBar";
import { EmptyState } from "../components/EmptyState";
import { PulseBadge } from "../components/PulseBadge";
import type { RootStackParamList } from "../navigators/AppNavigator";
import { PF_COLORS as C } from "../theme";

// My Profile: the connected wallet's address and four numbers about how I've played.
export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { selectedAccount, clearAuthorization } = useAuthorization();
  const { disconnect } = useMobileWallet();
  const { data: stats, isLoading } = useMyStats(selectedAccount?.publicKey ?? null);
  const [signedOut, setSignedOut] = useState(false);

  const signOut = async () => {
    try {
      // The wallet round trip can hang instead of rejecting (seen on the create-tournament
      // payment flow too — the wallet app's own side of the session never signals it's done),
      // which would leave this button looking dead with nothing to catch. A race against a
      // timeout guarantees we always fall through to forgetting the wallet locally.
      await Promise.race([
        disconnect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000)),
      ]);
    } catch {
      // Wallet app unreachable, cancelled the request, or timed out: still forget it here.
      await clearAuthorization();
    }
    setSignedOut(true);
  };

  if (signedOut) {
    return (
      <View style={styles.screen}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <PulseBadge style={styles.doneBadge}>
            <FontAwesome6 name="door-open" size={26} color={C.accent2TextOn} />
          </PulseBadge>
          <Text style={styles.doneTitle}>Successfully signed out</Text>
        </ScrollView>
        <BottomBar>
          <TouchableRipple style={styles.whiteButton} borderless onPress={() => navigation.navigate("HomeStack")}>
            <Text style={styles.whiteButtonText}>Go to lobby</Text>
          </TouchableRipple>
        </BottomBar>
      </View>
    );
  }

  if (!selectedAccount) {
    return <EmptyState icon="wallet" label="Wallet Not Connected" hint="Connect your wallet to see your profile." />;
  }
  const address = selectedAccount.publicKey.toBase58();

  const blocks = [
    { icon: "trophy", title: "Tournaments", value: String(stats?.tournaments ?? 0) },
    { icon: "bolt", title: "Live Tournaments", value: String(stats?.live ?? 0) },
    { icon: "medal", title: "Winning entries", value: String(stats?.wins ?? 0) },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <PnlCard events={stats?.events ?? []} address={address} />

        <View style={styles.grid}>
          {blocks.map((b) => (
            <View key={b.title} style={styles.block}>
              <FontAwesome6 name={b.icon} size={18} color={C.accent} />
              <Text style={styles.blockTitle} numberOfLines={1} adjustsFontSizeToFit>
                {b.title}
              </Text>
              {isLoading ? <ActivityIndicator size={18} color={C.accent} style={styles.spinner} /> : <Text style={styles.blockValue}>{b.value}</Text>}
            </View>
          ))}
        </View>

      </ScrollView>

      <BottomBar>
        <TouchableRipple style={styles.signOut} borderless onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableRipple>
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  grid: { flexDirection: "row", gap: 8 },
  block: {
    flex: 1,
    alignItems: "flex-start",
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8,
  },
  blockTitle: { color: C.textSecondary, fontWeight: "700", fontSize: 12, alignSelf: "stretch" },
  blockValue: { color: C.textPrimary, fontWeight: "800", fontSize: 28 },
  spinner: { alignSelf: "flex-start", height: 34 },
  signOut: { height: 52, borderRadius: 999, backgroundColor: C.glassStrong, justifyContent: "center", alignItems: "center" },
  signOutText: { color: C.textPrimary, fontWeight: "800", fontSize: 15 },
  doneBadge: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accent2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  doneTitle: { color: C.textPrimary, fontWeight: "800", fontSize: 22, textAlign: "center", marginTop: 16 },
  whiteButton: { height: 52, borderRadius: 999, backgroundColor: C.textPrimary, justifyContent: "center", alignItems: "center" },
  whiteButtonText: { color: "#000000", fontWeight: "800", fontSize: 15 },
});
