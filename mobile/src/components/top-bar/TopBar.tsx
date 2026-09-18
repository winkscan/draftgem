import { StyleSheet, View } from "react-native";
import { Text, TouchableRipple, ActivityIndicator } from "react-native-paper";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useQuery } from "@tanstack/react-query";
import { useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { useConnection } from "../../utils/ConnectionProvider";
import { ellipsify, formatSol } from "../../pumpfantasy/format";
import { UpdateBadge } from "./UpdateBadge";
import { PF_COLORS as C } from "../../theme";

// Matches the reference mockup's header: short address + SOL balance pill on
// the right, tapping it connects when there's no wallet yet. No dropdown
// menu (Explorer/Network/Disconnect) for this first pass — single-cluster
// app, nothing to switch to yet; add one back if that changes.
export function TopBar() {
  const { selectedAccount } = useAuthorization();
  const { connect } = useMobileWallet();
  const { connection } = useConnection();

  const { data: balanceLamports, isFetching } = useQuery({
    queryKey: ["sol-balance", selectedAccount?.publicKey.toBase58()],
    queryFn: () => connection.getBalance(selectedAccount!.publicKey),
    enabled: !!selectedAccount,
    refetchInterval: 15_000,
  });

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <FontAwesome6 name="chart-line" size={16} color={C.textOnHeader} />
        <Text variant="titleMedium" style={styles.title}>
          PumpFantasy
        </Text>
      </View>
      <View style={styles.right}>
        <UpdateBadge />
        <TouchableRipple style={styles.pill} onPress={selectedAccount ? undefined : connect} borderless>
          {selectedAccount ? (
            <View style={styles.pillContent}>
              <Text style={styles.address}>{ellipsify(selectedAccount.publicKey)}</Text>
              <View style={styles.divider} />
              {isFetching && balanceLamports == null ? (
                <ActivityIndicator size={10} color={C.textOnHeader} />
              ) : (
                <Text style={styles.balance}>{formatSol(balanceLamports ?? 0, 2)} SOL</Text>
              )}
              <FontAwesome6 name="wallet" size={12} color={C.textOnHeaderMuted} />
            </View>
          ) : (
            <View style={styles.pillContent}>
              <Text style={styles.balance}>Connect</Text>
              <FontAwesome6 name="wallet" size={12} color={C.textOnHeader} />
            </View>
          )}
        </TouchableRipple>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.header,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: C.textOnHeader, fontWeight: "700" },
  right: { flexDirection: "row", alignItems: "center", gap: 4 },
  pill: {
    backgroundColor: C.headerElevated,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  address: { color: C.textOnHeader, fontSize: 12, fontWeight: "600" },
  divider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.24)" },
  balance: { color: C.textOnHeader, fontSize: 12, fontWeight: "700" },
});
