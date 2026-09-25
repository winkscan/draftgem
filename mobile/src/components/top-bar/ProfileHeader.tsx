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
import { SolanaCoin } from "../SolanaIcon";
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
        {selectedAccount ? (
          <View style={styles.balanceWrap}>
            {isFetching && balanceLamports == null ? (
              <ActivityIndicator size={14} color={C.textOnHeader} />
            ) : (
              <Text style={styles.balance}>{formatSol(balanceLamports ?? 0, 2)}</Text>
            )}
            <SolanaCoin size={20} />
          </View>
        ) : null}
      </View>
      {selectedAccount ? <Text style={styles.address}>{ellipsify(selectedAccount.publicKey, 4)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.headerPanel, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingBottom: 16 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  back: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  title: { color: C.textOnHeader, fontWeight: "800", fontSize: 18, flex: 1 },
  balanceWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  balance: { color: C.textOnHeader, fontWeight: "800", fontSize: 18 },
  // Under the title: 16 side padding + the back button (28, pulled 6 left) + the gap.
  address: { color: C.textOnHeaderMuted, fontSize: 12, paddingLeft: 46, marginTop: -6 },
});
