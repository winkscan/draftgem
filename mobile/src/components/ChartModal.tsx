import { Modal, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, TouchableRipple } from "react-native-paper";
import { WebView } from "react-native-webview";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { usePoolAddress } from "../pumpfantasy/poolAddress";
import { PF_COLORS as C } from "../theme";

// In-app chart instead of bouncing out to Jupiter's site — free, no API key
// (see poolAddress.ts), rendered straight in a WebView pointed at
// GeckoTerminal's own embeddable chart page.
export function ChartModal({
  mint,
  symbol,
  onClose,
}: {
  mint: string | null;
  symbol: string;
  onClose: () => void;
}) {
  const { data: poolAddress, isLoading } = usePoolAddress(mint);

  return (
    <Modal visible={!!mint} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{symbol}</Text>
          <TouchableRipple style={styles.closeButton} borderless onPress={onClose}>
            <FontAwesome6 name="xmark" size={18} color={C.textPrimary} />
          </TouchableRipple>
        </View>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : poolAddress && mint ? (
          <WebView
            source={{
              uri: `https://www.geckoterminal.com/solana/pools/${poolAddress}?embed=1&info=0&swaps=0&light_chart=0`,
            }}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator color={C.accent} />
              </View>
            )}
          />
        ) : (
          <View style={styles.center}>
            <Text style={{ color: C.textSecondary }}>No chart available for this coin yet.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d1117" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { color: C.textPrimary, fontWeight: "700", fontSize: 16 },
  closeButton: { padding: 8, borderRadius: 999 },
  webview: { flex: 1, backgroundColor: "#0d1117" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
