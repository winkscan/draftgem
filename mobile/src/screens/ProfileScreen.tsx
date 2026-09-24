import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useMyStats } from "../pumpfantasy/profileStats";
import { PnlCard } from "../components/PnlCard";
import { BottomBar } from "../components/BottomBar";
import { EmptyState } from "../components/EmptyState";
import { PF_COLORS as C } from "../theme";

// My Profile: the connected wallet's address and four numbers about how I've played.
export function ProfileScreen() {
  const navigation = useNavigation();
  const { selectedAccount, clearAuthorization } = useAuthorization();
  const { disconnect } = useMobileWallet();
  const { data: stats, isLoading } = useMyStats(selectedAccount?.publicKey ?? null);

  if (!selectedAccount) {
    return <EmptyState icon="wallet" label="Wallet Not Connected" hint="Connect your wallet to see your profile." />;
  }
  const address = selectedAccount.publicKey.toBase58();

  const signOut = async () => {
    try {
      await disconnect();
    } catch {
      // Wallet app unreachable or cancelled the request: still forget it here.
      await clearAuthorization();
    }
    navigation.goBack();
  };

  const blocks = [
    { icon: "trophy", title: "Tournaments", value: String(stats?.tournaments ?? 0), color: C.textPrimary },
    { icon: "bolt", title: "Live Tournaments", value: String(stats?.live ?? 0), color: C.textPrimary },
    { icon: "medal", title: "Total wins", value: String(stats?.wins ?? 0), color: C.textPrimary },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <PnlCard events={stats?.events ?? []} address={address} />

        <View style={styles.grid}>
          {blocks.map((b) => (
            <View key={b.title} style={styles.block}>
              <View style={styles.blockHead}>
                <FontAwesome6 name={b.icon} size={14} color={C.textSecondary} />
                <Text style={styles.blockTitle} numberOfLines={1}>
                  {b.title}
                </Text>
              </View>
              {isLoading ? <ActivityIndicator size={18} color={C.accent} style={styles.spinner} /> : <Text style={[styles.blockValue, { color: b.color }]}>{b.value}</Text>}
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  block: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
    gap: 10,
  },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  blockTitle: { color: C.textSecondary, fontWeight: "700", fontSize: 13, flexShrink: 1 },
  blockValue: { fontWeight: "800", fontSize: 28 },
  spinner: { alignSelf: "flex-start", height: 34 },
  signOut: { height: 52, borderRadius: 999, backgroundColor: C.glassStrong, justifyContent: "center", alignItems: "center" },
  signOutText: { color: C.textPrimary, fontWeight: "800", fontSize: 15 },
});
