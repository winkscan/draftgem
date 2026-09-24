import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useAuthorization } from "../../utils/useAuthorization";
import { useConnection } from "../../utils/ConnectionProvider";
import { useChrome } from "../../utils/Chrome";
import { ellipsify, formatSol } from "../../pumpfantasy/format";
import { PF_COLORS as C } from "../../theme";

// The header of My Profile: the standard panel with the back arrow and title, and under it the wallet's
// short address and its SOL balance.
export function ProfileHeader({ title }: { title: string }) {
  const navigation = useNavigation();
  const { setPanelHeader } = useChrome();
  const { selectedAccount } = useAuthorization();
  const { connection } = useConnection();
  useEffect(() => {
    setPanelHeader(true);
    return () => setPanelHeader(false);
  }, [setPanelHeader]);

  const { data: balanceLamports, isFetching } = useQuery({
    queryKey: ["sol-balance", selectedAccount?.publicKey.toBase58()],
    queryFn: () => connection.getBalance(selectedAccount!.publicKey),
    enabled: !!selectedAccount,
    refetchInterval: 15_000,
  });

  return (
    <View style={styles.panel}>
      <View style={styles.bar}>
        <TouchableRipple style={styles.back} borderless onPress={() => navigation.goBack()}>
          <FontAwesome6 name="chevron-left" size={16} color={C.textOnHeader} />
        </TouchableRipple>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {selectedAccount ? (
        <View style={styles.wallet}>
          <FontAwesome6 name="wallet" size={12} color={C.textOnHeaderMuted} />
          <Text style={styles.address}>{ellipsify(selectedAccount.publicKey, 4)}</Text>
          <View style={styles.divider} />
          {isFetching && balanceLamports == null ? (
            <ActivityIndicator size={10} color={C.textOnHeader} />
          ) : (
            <Text style={styles.balance}>{formatSol(balanceLamports ?? 0, 2)} SOL</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.headerPanel, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingBottom: 16 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  back: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  title: { color: C.textOnHeader, fontWeight: "800", fontSize: 18, flexShrink: 1 },
  wallet: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  address: { color: C.textOnHeader, fontWeight: "700", fontSize: 14 },
  divider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.24)" },
  balance: { color: C.textOnHeader, fontWeight: "700", fontSize: 14 },
});
