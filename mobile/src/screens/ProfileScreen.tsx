import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useMyStats } from "../pumpfantasy/profileStats";
import { PnlCard } from "../components/PnlCard";
import { WORKER_URL, CLUSTER } from "../pumpfantasy/config";
import { useQueryClient } from "@tanstack/react-query";
import { BottomBar } from "../components/BottomBar";
import { EmptyState } from "../components/EmptyState";
import { PF_COLORS as C } from "../theme";

// My Profile: the connected wallet's address and four numbers about how I've played.
export function ProfileScreen() {
  const navigation = useNavigation();
  const { selectedAccount, clearAuthorization } = useAuthorization();
  const { disconnect } = useMobileWallet();
  const { data: stats, isLoading } = useMyStats(selectedAccount?.publicKey ?? null);
  const queryClient = useQueryClient();
  const [faucet, setFaucet] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  // Devnet only: real SKR can't be minted, so the worker hands out test SKR.
  const claimTestSkr = async () => {
    setFaucet({ busy: true, message: null });
    try {
      const res = await fetch(WORKER_URL + "/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: selectedAccount!.publicKey.toBase58() }),
      });
      const body = (await res.json()) as { amount?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not get test SKR");
      await queryClient.invalidateQueries({ queryKey: ["skr-balance"] });
      setFaucet({ busy: false, message: "+" + body.amount + " test SKR sent to your wallet" });
    } catch (e: any) {
      setFaucet({ busy: false, message: e?.message ?? "Could not get test SKR" });
    }
  };

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

        {CLUSTER === "devnet" ? (
          <View style={styles.faucet}>
            <TouchableRipple style={styles.faucetButton} borderless disabled={faucet.busy} onPress={claimTestSkr}>
              <View style={styles.faucetInner}>
                {faucet.busy ? <ActivityIndicator size={16} color={C.textPrimary} /> : <FontAwesome6 name="faucet" size={14} color={C.textPrimary} />}
                <Text style={styles.faucetText}>Get test SKR</Text>
              </View>
            </TouchableRipple>
            <Text style={styles.faucetHint}>{faucet.message ?? "The app runs on a test network. Free test SKR to try the tournaments."}</Text>
          </View>
        ) : null}
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
  faucet: { gap: 8, alignItems: "center" },
  faucetButton: { alignSelf: "stretch", height: 52, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder, justifyContent: "center" },
  faucetInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  faucetText: { color: C.textPrimary, fontWeight: "800", fontSize: 15 },
  faucetHint: { color: C.textSecondary, fontSize: 12, textAlign: "center" },
  signOut: { height: 52, borderRadius: 999, backgroundColor: C.glassStrong, justifyContent: "center", alignItems: "center" },
  signOutText: { color: C.textPrimary, fontWeight: "800", fontSize: 15 },
});
